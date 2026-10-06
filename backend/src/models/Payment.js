const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const paymentSchema = new mongoose.Schema(
  {
    referenceModel: {
      type: String,
      enum: ["Purchase", "Invoice"],
      required: true,
    },
    reference: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "referenceModel",
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    date: {
      type: String,
      required: [true, "Date is required"],
      validate: {
        validator: function (value) {
          return /^\d{4}-\d{2}-\d{2}$/.test(value);
        },
        message: "Date must be in YYYY-MM-DD format",
      },
    },
    dateMode: {
      type: String,
      enum: ["AD", "BS"],
      default: "BS",
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    method: {
      type: String,
      enum: ["cash", "bank"],
      required: true,
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    // Set when this payment is one allocation line of a customer Receipt
    // (a lump-sum payment that was split across several invoices). Payments
    // created the old way, straight against a single invoice, leave it null.
    receipt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receipt",
      default: null,
    },
  },
  { timestamps: true },
);

paymentSchema.index({ client: 1, createdAt: -1 });
paymentSchema.index({ receipt: 1 });
paymentSchema.index({ reference: 1 });

paymentSchema.plugin(companyScope);

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;
