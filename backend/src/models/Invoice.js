const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const VAT_RATE = 0.13;

const invoiceItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    hsCode: { type: String, trim: true, default: "" },
    grade: { type: String, trim: true, default: "" },
    size: { type: String, trim: true, default: "" },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },
    rate: {
      type: Number,
      required: true,
      min: [0, "Rate cannot be negative"],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, "Invoice number is required"],
      trim: true,
      // NOTE: no `unique: true` here — invoice numbers only need to be
      // unique *within* a company. See the compound index below.
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: [true, "Client is required"],
    },

    buyerName: { type: String, trim: true, default: "" },
    vatNumber: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    contactNumber: { type: String, trim: true, default: "" },

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

    paymentMode: {
      type: String,
      enum: ["cash", "credit", "bank"],
      default: "cash",
    },

    items: {
      type: [invoiceItemSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "Invoice must have at least one item",
      },
    },

    remarks: { type: String, trim: true, default: "" },

    subtotal: { type: Number, required: true, min: 0 },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
    },
    taxableAmount: { type: Number, required: true, min: 0 },
    vatAmount: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },

    amountReceived: {
      type: Number,
      default: 0,
      min: [0, "Amount received cannot be negative"],
    },
    dueAmount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

invoiceSchema.index({ customer: 1, createdAt: -1 });
invoiceSchema.index({ company: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.statics.VAT_RATE = VAT_RATE;

invoiceSchema.plugin(companyScope);

const Invoice = mongoose.model("Invoice", invoiceSchema);

module.exports = Invoice;
