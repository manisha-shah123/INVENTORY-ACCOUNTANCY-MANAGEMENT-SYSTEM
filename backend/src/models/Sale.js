const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const saleSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    date: { type: String },
    invoiceNumber: { type: String, trim: true },
    quantity: { type: Number },
    rate: { type: Number },
    total: { type: Number },
    amountReceived: { type: Number, default: 0 },
    dueAmount: { type: Number },
  },
  { timestamps: true },
);

saleSchema.plugin(companyScope);

module.exports = mongoose.models.Sale || mongoose.model("Sale", saleSchema);