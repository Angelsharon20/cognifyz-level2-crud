/**
 * /server.js
 * Level 2 + Level 4 — ProductHub: Product Management System
 *
 * Upgrades in v2:
 *  ✦ Rate limiting   — express-rate-limit (global + per-mutation)
 *  ✦ Currency API    — Live exchange rates via axios (USD → EUR / INR / GBP)
 *  ✦ Rate cache      — Exchange rates cached for 10 min (avoids hammering free API)
 *  ✦ Error handling  — All routes use next(err) → centralized errorHandler
 *  ✦ Async wrapper   — asyncWrap() eliminates try/catch boilerplate in routes
 */

require("dotenv").config();

const express        = require("express");
const mongoose       = require("mongoose");
const methodOverride = require("method-override");
const path           = require("path");
const axios          = require("axios");
const { body, validationResult } = require("express-validator");

const connectDB    = require("./config/db");
const Product      = require("./models/Product");
const { globalLimiter, apiLimiter } = require("./middleware/rateLimiter");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

// ── App bootstrap ─────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

const CATEGORIES = [
  "Electronics","Clothing","Food & Beverage","Books",
  "Home & Garden","Sports","Beauty","Other",
];

// ── Connect to MongoDB ────────────────────────────────────────────────────────
connectDB();

// Handle MongoDB connection drops AFTER initial connect (keeps process alive)
mongoose.connection.on("disconnected", () =>
  console.warn("⚠️   MongoDB disconnected. Reconnecting…")
);
mongoose.connection.on("reconnected", () =>
  console.log("✅  MongoDB reconnected.")
);
mongoose.connection.on("error", (err) =>
 console.error("MongoDB runtime error:", err.message);
);

// ── View engine ───────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use(globalLimiter);                  // blanket: 200 req / 15 min / IP
app.use("/products", apiLimiter);        // tighter: 100 mutations / 15 min / IP

// ── Async route wrapper ───────────────────────────────────────────────────────
// Eliminates try/catch in every route; forwards thrown errors to errorHandler.
const asyncWrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ── Validation rules ──────────────────────────────────────────────────────────
const productValidation = [
  body("product_name")
    .trim()
    .notEmpty().withMessage("Product name is required.")
    .isLength({ min: 2, max: 120 }).withMessage("Name must be 2–120 characters."),
  body("price")
    .notEmpty().withMessage("Price is required.")
    .isFloat({ min: 0 }).withMessage("Price must be a positive number."),
  body("category")
    .trim()
    .notEmpty().withMessage("Category is required.")
    .isIn(CATEGORIES).withMessage("Invalid category selected."),
  body("stock_quantity")
    .notEmpty().withMessage("Stock quantity is required.")
    .isInt({ min: 0 }).withMessage("Stock must be a non-negative whole number."),
];

const getErrors = (req) => validationResult(req).array().map((e) => e.msg);

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY API — Live exchange rates with 10-minute in-memory cache
// Source: https://open.er-api.com (free, no key required for USD base)
// ─────────────────────────────────────────────────────────────────────────────
const rateCache = { data: null, fetchedAt: null };
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes in ms

async function getLiveRates() {
  const now = Date.now();

  // Return cached rates if fresh
  if (rateCache.data && rateCache.fetchedAt && (now - rateCache.fetchedAt) < CACHE_TTL) {
    return rateCache.data;
  }

  try {
    const response = await axios.get("https://open.er-api.com/v6/latest/USD", {
      timeout: 5000, // 5s hard timeout — never block a page render
    });

    if (response.data?.result === "success" && response.data?.rates) {
      const rates = {
        USD: 1,
        EUR: parseFloat((response.data.rates.EUR || 0.92).toFixed(4)),
        INR: parseFloat((response.data.rates.INR || 83.5).toFixed(2)),
        GBP: parseFloat((response.data.rates.GBP || 0.79).toFixed(4)),
        source: "live",
        updatedAt: new Date().toLocaleTimeString(),
      };

      // Update cache
      rateCache.data      = rates;
      rateCache.fetchedAt = now;

      console.log(`💱  Exchange rates refreshed — EUR: ${rates.EUR} | INR: ${rates.INR} | GBP: ${rates.GBP}`);
      return rates;
    }

    throw new Error("Invalid API response structure");

  } catch (err) {
    console.warn(`⚠️   Currency API unavailable (${err.message}) — using fallback rates.`);

    // Graceful fallback — never crash the dashboard over a currency API failure
    const fallback = {
      USD: 1,
      EUR: 0.92,
      INR: 83.5,
      GBP: 0.79,
      source: "fallback",
      updatedAt: "unavailable",
    };

    // Cache the fallback for 2 minutes so we don't hammer a failing API
    rateCache.data      = fallback;
    rateCache.fetchedAt = now - CACHE_TTL + (2 * 60 * 1000);

    return fallback;
  }
}

// ── API endpoint: expose rates as JSON (for client-side refresh) ──────────────
app.get("/api/rates", asyncWrap(async (req, res) => {
  const rates = await getLiveRates();
  res.json({ success: true, rates });
}));

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// ── READ — Dashboard ──────────────────────────────────────────────────────────
app.get("/", asyncWrap(async (req, res) => {
  const { search = "", category = "", sort = "createdAt_desc" } = req.query;

  // Build filter
  const filter = {};
  if (search)   filter.product_name = { $regex: search, $options: "i" };
  if (category) filter.category = category;

  // Build sort
  const [sortField, sortDir] = sort.split("_");
  const sortObj = { [sortField]: sortDir === "asc" ? 1 : -1 };

  // Fetch products + exchange rates in parallel (neither blocks the other)
  const [products, rates] = await Promise.all([
    Product.find(filter).sort(sortObj).lean(),
    getLiveRates(),
  ]);

  // Stats
  const totalProducts   = products.length;
  const totalValueUSD   = products.reduce((s, p) => s + p.price * p.stock_quantity, 0);
  const lowStockCount   = products.filter(p => p.stock_quantity < 10 && p.stock_quantity > 0).length;
  const outOfStockCount = products.filter(p => p.stock_quantity === 0).length;

  res.render("index", {
    products,
    totalProducts,
    totalValueUSD:    parseFloat(totalValueUSD.toFixed(2)),
    lowStockCount,
    outOfStockCount,
    search,
    category,
    sort,
    categories: CATEGORIES,
    rates,              // { USD, EUR, INR, GBP, source, updatedAt }
  });
}));

// ── CREATE — Show form ────────────────────────────────────────────────────────
app.get("/products/new", (req, res) => {
  res.render("add-product", { errors: [], formData: {}, categories: CATEGORIES });
});

// ── CREATE — Handle POST ──────────────────────────────────────────────────────
app.post("/products", productValidation, asyncWrap(async (req, res, next) => {
  const errors = getErrors(req);
  if (errors.length) {
    return res.status(422).render("add-product", {
      errors, formData: req.body, categories: CATEGORIES,
    });
  }
  const { product_name, price, category, stock_quantity } = req.body;
  await Product.create({
    product_name,
    price:          parseFloat(price),
    category,
    stock_quantity: parseInt(stock_quantity, 10),
  });
  res.redirect("/?success=Product+added+successfully");
}));

// ── UPDATE — Show edit form ───────────────────────────────────────────────────
app.get("/products/:id/edit", asyncWrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    const err = new Error("Invalid product ID."); err.status = 400; throw err;
  }
  const product = await Product.findById(req.params.id).lean();
  if (!product) {
    const err = new Error("Product not found."); err.status = 404; throw err;
  }
  res.render("edit-product", { product, errors: [], categories: CATEGORIES });
}));

// ── UPDATE — Handle PUT ───────────────────────────────────────────────────────
app.put("/products/:id", productValidation, asyncWrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    const err = new Error("Invalid product ID."); err.status = 400; throw err;
  }
  const errors = getErrors(req);
  if (errors.length) {
    const product = { ...req.body, _id: req.params.id };
    return res.status(422).render("edit-product", {
      product, errors, categories: CATEGORIES,
    });
  }
  const { product_name, price, category, stock_quantity } = req.body;
  const updated = await Product.findByIdAndUpdate(
    req.params.id,
    { product_name, price: parseFloat(price), category, stock_quantity: parseInt(stock_quantity, 10) },
    { new: true, runValidators: true }
  );
  if (!updated) {
    const err = new Error("Product not found."); err.status = 404; throw err;
  }
  res.redirect("/?success=Product+updated+successfully");
}));

// ── DELETE ────────────────────────────────────────────────────────────────────
app.delete("/products/:id", asyncWrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    const err = new Error("Invalid product ID."); err.status = 400; throw err;
  }
  await Product.findByIdAndDelete(req.params.id);
  res.redirect("/?success=Product+deleted+successfully");
}));

// ── 404 + Global error handler (MUST be last) ─────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  Server running  → http://localhost:${PORT}`);
  console.log(`🛡️   Rate limiting  → active (200 global / 100 mutations per 15 min)`);
  console.log(`💱  Currency API   → live rates from open.er-api.com (10 min cache)`);
});
