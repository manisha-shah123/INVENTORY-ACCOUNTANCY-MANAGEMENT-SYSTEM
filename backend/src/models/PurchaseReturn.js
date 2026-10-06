const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const purchaseReturnSchema = new mongoose.Schema(
  {
    purchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Purchase",
      required: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    date: {
      type: String,
      required: [true, "Date is required"],
      validate: {
        validator: function (value) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
          const inputDate = new Date(value + "T00:00:00");
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          return inputDate <= today;
        },
        message: "Date cannot be in the future",
      },
    },

    dateMode: {
      type: String,
      enum: ["AD", "BS"],
      default: "BS",
    },

    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },

    rate: {
      type: Number,
      required: true,
      min: 0,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    reason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

purchaseReturnSchema.index({ purchase: 1, createdAt: -1 });

purchaseReturnSchema.plugin(companyScope);

const PurchaseReturn = mongoose.model("PurchaseReturn", purchaseReturnSchema);

module.exports = PurchaseReturn;