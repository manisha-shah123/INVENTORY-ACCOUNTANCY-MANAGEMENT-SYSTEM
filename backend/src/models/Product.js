const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      validate: {
        validator: function (value) {
          return /[A-Za-z]/.test(value);
        },
        message: "Product name must contain letters, not just numbers",
      },
    },

    sku: {
      type: String,
      required: [true, "SKU is required"],
      trim: true,
      uppercase: true,
      // NOTE: no `unique: true` here anymore — SKUs only need to be unique
      // *within* a company. See the compound index below.
    },

    brand: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "" },
    hsCode: { type: String, trim: true, default: "" },

     unit: {
      type: String,
      trim: true,
      default: "pcs",
      validate: {
        validator: function (value) {
          if (!value) return true;
          return /[A-Za-z]/.test(value);
        },
        message: "Unit must be a word like pcs, litre, box — not just a number",
      },
    },

    purchasePrice: {
      type: Number,
      required: [true, "Purchase price is required"],
      min: [0, "Purchase price cannot be negative"],
    },

    sellingPrice: {
      type: Number,
      required: [true, "Selling price is required"],
      min: [0, "Selling price cannot be negative"],
    },

    currentStock: {
      type: Number,
      default: 0,
      min: [0, "Stock cannot be negative"],
    },

    minimumStock: {
      type: Number,
      default: 0,
      min: [0, "Minimum stock cannot be negative"],
    },
  },
  { timestamps: true },
);

productSchema.index({ name: 1 });
productSchema.index({ company: 1, sku: 1 }, { unique: true });

productSchema.plugin(companyScope);

const Product = mongoose.model("Product", productSchema);

module.exports = Product;