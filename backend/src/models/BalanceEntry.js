const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");
const { ENTRY_TYPES } = require("../utils/balanceSheetCalc");

const balanceEntrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: Object.keys(ENTRY_TYPES),
      required: [true, "Entry type is required"],
    },

    // Stored as AD "YYYY-MM-DD" like every other date in the app.
    date: {
      type: String,
      required: [true, "Date is required"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"],
    },
    dateMode: { type: String, enum: ["AD", "BS"], default: "BS" },

    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },

    // Where the money went in/out. Empty for entries that move no money
    // (depreciation).
    method: { type: String, enum: ["cash", "bank"] },

    note: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: true },
);

balanceEntrySchema.index({ company: 1, date: -1 });

balanceEntrySchema.plugin(companyScope);

module.exports = mongoose.model("BalanceEntry", balanceEntrySchema);
