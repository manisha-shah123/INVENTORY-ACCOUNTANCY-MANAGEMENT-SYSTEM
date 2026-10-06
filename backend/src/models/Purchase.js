const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const purchaseSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: [true, "Supplier is required"],
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
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

    invoiceNumber: {
      type: String,
      required: [true, "Invoice number is required"],
      trim: true,
    },

    // Which variant of the product this stock is (e.g. "5w30 Fully Synthetic"
    // in a "3.5L" pack). Optional. They are what the Stock Summary page uses
    // to group stock-in against the sales made from the same variant.
    grade: { type: String, trim: true, default: "" },
    size: { type: String, trim: true, default: "" },

    remarks: { type: String, trim: true, default: "" },

    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },

    rate: {
      type: Number,
      required: [true, "Rate is required"],
      min: [0, "Rate cannot be negative"],
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    amountPaid: {
      type: Number,
      default: 0,
      min: [0, "Amount paid cannot be negative"],
    },

    // How the amount paid at purchase time was paid. The Balance Sheet needs
    // this to tell cash from bank. Older purchases have no value (= cash).
    paymentMethod: {
      type: String,
      enum: ["cash", "bank"],
      default: "cash",
    },

    dueAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    returnedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

purchaseSchema.index({ supplier: 1, createdAt: -1 });

purchaseSchema.plugin(companyScope);

const Purchase = mongoose.model("Purchase", purchaseSchema);

module.exports = Purchase;