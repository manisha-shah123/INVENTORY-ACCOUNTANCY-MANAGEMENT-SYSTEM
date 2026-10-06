const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const stockMovementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    type: {
      type: String,
      enum: ["in", "out"],
      required: true,
    },

    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },

    reason: {
      type: String,
      trim: true,
      default: "",
    },

    // What created this movement: "opening", "sale", "purchase",
    // "purchase_return" or "adjustment". The Balance Sheet uses it to find
    // manual stock adjustments. Older movements have no source; the
    // Balance Sheet works it out from the reason text instead.
    source: {
      type: String,
      trim: true,
    },

    balanceAfter: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

stockMovementSchema.index({ product: 1, createdAt: -1 });

stockMovementSchema.plugin(companyScope);

const StockMovement = mongoose.model("StockMovement", stockMovementSchema);

module.exports = StockMovement;
