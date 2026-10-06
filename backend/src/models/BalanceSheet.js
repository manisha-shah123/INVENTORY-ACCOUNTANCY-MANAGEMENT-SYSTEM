const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const BALANCE_ACCOUNTS = [
  "cash",
  "bank",
  "accountsReceivable",
  "inventory",
  "otherCurrentAssets",
  "fixedAssets",
  "accountsPayable",
  "loans",
  "otherCurrentLiabilities",
  "capital",
  "retainedEarnings",
  "currentYearProfit",
];

const balanceSchema = new mongoose.Schema(
  {
    fiscalYear: {
      type: String,
      required: [true, "Fiscal year is required"],
      trim: true,
      match: [/^\d{4}\/\d{2}$/, "Fiscal year must be in YYYY/YY format"],
    },

    startDate: {
      type: String,
      required: [true, "Fiscal year start date is required"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"],
    },

    endDate: {
      type: String,
      required: [true, "Fiscal year end date is required"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"],
    },

    opening: {
      cash: { type: Number, default: 0 },
      bank: { type: Number, default: 0 },
      accountsReceivable: { type: Number, default: 0 },
      inventory: { type: Number, default: 0 },
      otherCurrentAssets: { type: Number, default: 0 },
      fixedAssets: { type: Number, default: 0 },
      accountsPayable: { type: Number, default: 0 },
      loans: { type: Number, default: 0 },
      otherCurrentLiabilities: { type: Number, default: 0 },
      capital: { type: Number, default: 0 },
      retainedEarnings: { type: Number, default: 0 },
      currentYearProfit: { type: Number, default: 0 },
    },

    closing: {
      cash: { type: Number, default: 0 },
      bank: { type: Number, default: 0 },
      accountsReceivable: { type: Number, default: 0 },
      inventory: { type: Number, default: 0 },
      otherCurrentAssets: { type: Number, default: 0 },
      fixedAssets: { type: Number, default: 0 },
      accountsPayable: { type: Number, default: 0 },
      loans: { type: Number, default: 0 },
      otherCurrentLiabilities: { type: Number, default: 0 },
      capital: { type: Number, default: 0 },
      retainedEarnings: { type: Number, default: 0 },
      currentYearProfit: { type: Number, default: 0 },
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
  },
  { timestamps: true },
);

balanceSchema.index({ company: 1, fiscalYear: 1 }, { unique: true });
balanceSchema.plugin(companyScope);

balanceSchema.statics.ACCOUNTS = BALANCE_ACCOUNTS;

module.exports = mongoose.model("BalanceSheet", balanceSchema);
