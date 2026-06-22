/**
 * /models/Product.js
 * Mongoose schema & model for the Product entity.
 * All fields carry built-in validation at the schema level (defence-in-depth
 * alongside express-validator on the route layer).
 */

const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    product_name: {
      type: String,
      required: [true, "Product name is required."],
      trim: true,
      minlength: [2, "Product name must be at least 2 characters."],
      maxlength: [120, "Product name cannot exceed 120 characters."],
    },

    price: {
      type: Number,
      required: [true, "Price is required."],
      min: [0, "Price cannot be negative."],
    },

    category: {
      type: String,
      required: [true, "Category is required."],
      trim: true,
      enum: {
        values: ["Electronics", "Clothing", "Food & Beverage", "Books", "Home & Garden", "Sports", "Beauty", "Other"],
        message: '"{VALUE}" is not a valid category.',
      },
    },

    stock_quantity: {
      type: Number,
      required: [true, "Stock quantity is required."],
      min: [0, "Stock quantity cannot be negative."],
      validate: {
        validator: Number.isInteger,
        message: "Stock quantity must be a whole number.",
      },
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt automatically
  }
);

// Virtual: stock status label derived from quantity
productSchema.virtual("stockStatus").get(function () {
  if (this.stock_quantity === 0) return "Out of Stock";
  if (this.stock_quantity < 10) return "Low Stock";
  return "In Stock";
});

// Virtual: formatted price string
productSchema.virtual("formattedPrice").get(function () {
  return `$${this.price.toFixed(2)}`;
});

module.exports = mongoose.model("Product", productSchema);
