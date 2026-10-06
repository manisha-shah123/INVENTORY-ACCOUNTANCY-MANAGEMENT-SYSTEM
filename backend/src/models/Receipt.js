const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const allocationSchema = new mongoose.Schema(
  {
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
    },
    invoiceNumber: { type: String, trim: true, default: "" },
    invoiceDate: { type: String, default: "" },
    invoiceDateMode: { type: String, enum: ["AD", "BS"], default: "BS" },
    invoiceTotal: { type: Number, default: 0, min: 0 },
    dueBefore: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: [0.01, "Amount must be greater than 0"] },
    dueAfter: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const receiptSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: [true, "Receipt number is required"],
      trim: true,
      // unique per company — see the compound index below
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: [true, "Customer is required"],
    },

    // Kept so the receipt still reads correctly if the customer is deleted later.
    customerName: { type: String, trim: true, default: "" },

    date: {
      type: String,
      required: [true, "Date is required"],
      validate: {
        validator: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
        message: "Date must be in YYYY-MM-DD format",
      },
    },

    dateMode: { type: String, enum: ["AD", "BS"], default: "BS" },

    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },

    method: { type: String, enum: ["cash", "bank"], required: true },

    remarks: { type: String, trim: true, default: "" },

    // The customer's TOTAL receivable (across all invoices) immediately before
    // and after this payment.
    dueBefore: { type: Number, required: true, min: 0 },
    dueAfter: { type: Number, required: true, min: 0 },

    allocations: {
      type: [allocationSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "Receipt must settle at least one invoice",
      },
    },
  },
  { timestamps: true },
);

receiptSchema.index({ company: 1, receiptNumber: 1 }, { unique: true });
receiptSchema.index({ customer: 1, createdAt: -1 });

receiptSchema.plugin(companyScope);

const Receipt = mongoose.model("Receipt", receiptSchema);

module.exports = Receipt;
