/**
 * /config/db.js
 * JSON file-based "database" — a drop-in replacement for MongoDB/Mongoose.
 * All data is stored in /data/products.json on disk.
 * Provides the same async API shape as the Mongoose version so server.js
 * reads cleanly and can be swapped back to MongoDB with minimal changes.
 */

const fs   = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DATA_DIR  = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "products.json");

// Ensure the data directory and file exist on first run
function ensureStore() {
  if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// Read all products from disk
function readAll() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

// Write the full products array back to disk (atomic-ish via temp file)
function writeAll(products) {
  ensureStore();
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(products, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ── Validation helper (mirrors Mongoose schema rules) ────────────────────────
const CATEGORIES = ["Electronics","Clothing","Food & Beverage","Books","Home & Garden","Sports","Beauty","Other"];

function validate(data) {
  const errors = [];
  const name = (data.product_name || "").trim();
  const price = parseFloat(data.price);
  const qty   = parseInt(data.stock_quantity, 10);

  if (!name || name.length < 2 || name.length > 120)
    errors.push("Product name must be 2–120 characters.");
  if (isNaN(price) || price < 0)
    errors.push("Price must be a positive number.");
  if (!CATEGORIES.includes(data.category))
    errors.push("Invalid category selected.");
  if (isNaN(qty) || qty < 0 || !Number.isInteger(qty))
    errors.push("Stock quantity must be a non-negative whole number.");

  return errors;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return all products, with optional filter + sort */
async function find({ search = "", category = "", sort = "createdAt_desc" } = {}) {
  let products = readAll();

  if (search)
    products = products.filter(p =>
      p.product_name.toLowerCase().includes(search.toLowerCase())
    );

  if (category)
    products = products.filter(p => p.category === category);

  // Sort
  const [field, dir] = sort.split("_");
  const sortField = field === "createdAt" ? "createdAt" : field;
  products.sort((a, b) => {
    let av = a[sortField], bv = b[sortField];
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return dir === "asc" ? -1 :  1;
    if (av > bv) return dir === "asc" ?  1 : -1;
    return 0;
  });

  return products;
}

/** Find a single product by its id string */
async function findById(id) {
  return readAll().find(p => p._id === id) || null;
}

/** Create a new product. Returns the saved product or throws on validation. */
async function create(data) {
  const errors = validate(data);
  if (errors.length) throw new Error(errors.join(" | "));

  const product = {
    _id:            uuidv4(),
    product_name:   data.product_name.trim(),
    price:          parseFloat(data.price),
    category:       data.category,
    stock_quantity: parseInt(data.stock_quantity, 10),
    createdAt:      new Date().toISOString(),
    updatedAt:      new Date().toISOString(),
  };

  const all = readAll();
  all.push(product);
  writeAll(all);
  return product;
}

/** Update an existing product by id. Returns updated product or null. */
async function findByIdAndUpdate(id, data) {
  const errors = validate(data);
  if (errors.length) throw new Error(errors.join(" | "));

  const all     = readAll();
  const index   = all.findIndex(p => p._id === id);
  if (index === -1) return null;

  all[index] = {
    ...all[index],
    product_name:   data.product_name.trim(),
    price:          parseFloat(data.price),
    category:       data.category,
    stock_quantity: parseInt(data.stock_quantity, 10),
    updatedAt:      new Date().toISOString(),
  };

  writeAll(all);
  return all[index];
}

/** Delete a product by id. Returns true if deleted, false if not found. */
async function findByIdAndDelete(id) {
  const all      = readAll();
  const filtered = all.filter(p => p._id !== id);
  if (filtered.length === all.length) return false;
  writeAll(filtered);
  return true;
}

module.exports = { find, findById, create, findByIdAndUpdate, findByIdAndDelete, CATEGORIES };
