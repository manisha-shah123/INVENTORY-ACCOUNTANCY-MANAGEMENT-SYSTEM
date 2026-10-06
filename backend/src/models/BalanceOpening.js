const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const balanceOpeningSchema = new mongoose.Schema(
  {
    slot: { type: String, default: "opening", immutable: true },

    cash: { type: Number, default: 0, min: [0, "Cash cannot be negative"] },
    bank: { type: Number, default: 0, min: [0, "Bank cannot be negative"] },
    // Value of fixed assets (machinery, vehicles, furniture...) after
    // depreciation.
    fixedAssets: {
      type: Number,
      default: 0,
      min: [0, "Fixed assets cannot be negative"],
    },
    loans: { type: Number, default: 0, min: [0, "Loans cannot be negative"] },
  },
  { timestamps: true },
);

balanceOpeningSchema.index({ company: 1, slot: 1 }, { unique: true });

balanceOpeningSchema.plugin(companyScope);

module.exports = mongoose.model("BalanceOpening", balanceOpeningSchema);
