const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const CATEGORIES = [
  "Transport",
  "Salary",
  "Rent",
  "Fuel",
  "Office",
  "Marketing",
  "Other",
];

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: CATEGORIES,
      required: [true, "Category is required"],
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

    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    // Whether the expense was paid from cash or from the bank. The Balance
    // Sheet needs this to tell cash from bank. Older expenses have no value
    // (= cash).
    paymentMethod: {
      type: String,
      enum: ["cash", "bank"],
      default: "cash",
    },
  },
  {
    timestamps: true,
  },
);

expenseSchema.index({ date: -1 });

expenseSchema.plugin(companyScope);

expenseSchema.statics.CATEGORIES = CATEGORIES;

const Expense = mongoose.model("Expense", expenseSchema);

module.exports = Expense;
