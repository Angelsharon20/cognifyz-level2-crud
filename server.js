/**
 * /server.js
 * Express application — full CRUD Product Management System.
 * Database: local JSON file via /config/db.js (no MongoDB required).
 */

const express        = require("express");
const methodOverride = require("method-override");
const path           = require("path");
const { body, validationResult } = require("express-validator");

const db = require("./config/db");   // JSON file DB — same async API

// ── App bootstrap ─────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── View engine ───────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method")); // enables PUT & DELETE from HTML forms

// ── Shared validation rules ───────────────────────────────────────────────────
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
    .isIn(db.CATEGORIES).withMessage("Invalid category selected."),

  body("stock_quantity")
    .notEmpty().withMessage("Stock quantity is required.")
    .isInt({ min: 0 }).withMessage("Stock must be a non-negative whole number."),
];

const getErrors = (req) => validationResult(req).array().map((e) => e.msg);

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// ── READ — Dashboard ──────────────────────────────────────────────────────────
app.get("/", async (req, res) => {
  try {
    const { search = "", category = "", sort = "createdAt_desc" } = req.query;
    const products = await db.find({ search, category, sort });

    const totalProducts   = products.length;
    const totalValue      = products.reduce((s, p) => s + p.price * p.stock_quantity, 0);
    const lowStockCount   = products.filter(p => p.stock_quantity < 10 && p.stock_quantity > 0).length;
    const outOfStockCount = products.filter(p => p.stock_quantity === 0).length;

    res.render("index", {
      products,
      totalProducts,
      totalValue: totalValue.toFixed(2),
      lowStockCount,
      outOfStockCount,
      search,
      category,
      sort,
      categories: db.CATEGORIES,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error while fetching products.");
  }
});

// ── CREATE — Show form ────────────────────────────────────────────────────────
app.get("/products/new", (req, res) => {
  res.render("add-product", { errors: [], formData: {}, categories: db.CATEGORIES });
});

// ── CREATE — Handle submission ────────────────────────────────────────────────
app.post("/products", productValidation, async (req, res) => {
  const errors = getErrors(req);
  if (errors.length) {
    return res.status(422).render("add-product", {
      errors, formData: req.body, categories: db.CATEGORIES,
    });
  }
  try {
    await db.create(req.body);
    res.redirect("/?success=Product+added+successfully");
  } catch (err) {
    console.error(err);
    res.status(500).render("add-product", {
      errors: [err.message], formData: req.body, categories: db.CATEGORIES,
    });
  }
});

// ── UPDATE — Show edit form ───────────────────────────────────────────────────
app.get("/products/:id/edit", async (req, res) => {
  try {
    const product = await db.findById(req.params.id);
    if (!product) return res.status(404).send("Product not found.");
    res.render("edit-product", { product, errors: [], categories: db.CATEGORIES });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error.");
  }
});

// ── UPDATE — Handle PUT ───────────────────────────────────────────────────────
app.put("/products/:id", productValidation, async (req, res) => {
  const errors = getErrors(req);
  if (errors.length) {
    const product = { ...req.body, _id: req.params.id };
    return res.status(422).render("edit-product", {
      product, errors, categories: db.CATEGORIES,
    });
  }
  try {
    const updated = await db.findByIdAndUpdate(req.params.id, req.body);
    if (!updated) return res.status(404).send("Product not found.");
    res.redirect("/?success=Product+updated+successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error while updating product.");
  }
});

// ── DELETE ────────────────────────────────────────────────────────────────────
app.delete("/products/:id", async (req, res) => {
  try {
    await db.findByIdAndDelete(req.params.id);
    res.redirect("/?success=Product+deleted+successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error while deleting product.");
  }
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).send("<h2>404 — Page not found.</h2><a href='/'>← Back to Dashboard</a>");
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  Server running → http://localhost:${PORT}`);
  console.log(`💾  Data stored in → data/products.json`);
});
