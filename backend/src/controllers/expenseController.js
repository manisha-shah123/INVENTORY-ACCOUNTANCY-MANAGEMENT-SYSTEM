const Expense = require("../models/Expense");

const PAYMENT_METHODS = ["cash", "bank"];

// An omitted / empty method is fine (old clients, old records); anything else
// must be "cash" or "bank".
const isAcceptableMethod = (value) =>
  value === undefined || value === "" || PAYMENT_METHODS.includes(value);

const getExpenses = async (req, res) => {
  try {
    const { category } = req.query;
    const filter = {};
    if (category) filter.category = category;

    const expenses = await Expense.find(filter).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: expenses });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch expenses" });
  }
};

const getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res
        .status(404)
        .json({ success: false, message: "Expense not found" });
    }

    res.status(200).json({ success: true, data: expense });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch expense" });
  }
};

const createExpense = async (req, res) => {
  try {
    const { category, date, dateMode, amount, description, paymentMethod } =
      req.body;

    if (!category) {
      return res
        .status(400)
        .json({ success: false, message: "Category is required" });
    }
    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: "Date is required" });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Amount must be greater than 0" });
    }
    if (!isAcceptableMethod(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Payment method must be 'cash' or 'bank'",
      });
    }

    const expense = await Expense.create({
      category,
      date,
      dateMode: dateMode === "AD" ? "AD" : "BS",
      amount: amt,
      description,
      paymentMethod: paymentMethod === "bank" ? "bank" : "cash",
    });

    res.status(201).json({
      success: true,
      message: "Expense recorded successfully",
      data: expense,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to create expense" });
  }
};

const updateExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res
        .status(404)
        .json({ success: false, message: "Expense not found" });
    }

    const { category, date, dateMode, amount, description, paymentMethod } =
      req.body;

    if (!category) {
      return res
        .status(400)
        .json({ success: false, message: "Category is required" });
    }
    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: "Date is required" });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Amount must be greater than 0" });
    }
    if (!isAcceptableMethod(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Payment method must be 'cash' or 'bank'",
      });
    }

    expense.category = category;
    expense.date = date;
    expense.dateMode = dateMode === "AD" ? "AD" : "BS";
    expense.amount = amt;
    expense.description = description;
    // Only change the method when one was sent; otherwise keep what's saved.
    if (paymentMethod === "cash" || paymentMethod === "bank") {
      expense.paymentMethod = paymentMethod;
    }

    await expense.save();

    res.status(200).json({
      success: true,
      message: "Expense updated successfully",
      data: expense,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to update expense" });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);

    if (!expense) {
      return res
        .status(404)
        .json({ success: false, message: "Expense not found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Expense deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete expense" });
  }
};

module.exports = {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
};
