const mongoose = require("mongoose");
const Product = require("../models/Product");
const Purchase = require("../models/Purchase");
const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const { getCurrentCompanyId } = require("../utils/tenantContext");

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// True only for a real calendar date in YYYY-MM-DD form ("2026-02-31" is false).
const isValidIsoDate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

// Query params that were left out (or sent empty) mean "no limit on that side".
const isProvided = (value) => value !== undefined && value !== "";

/**
 * GET /api/dashboard/summary
 *
 * Optional query params (both are AD dates, "YYYY-MM-DD", inclusive):
 *   startDate -> only count invoices / purchases dated on or after this day
 *   endDate   -> only count invoices / purchases dated on or before this day
 *
 * The date filter applies ONLY to totalSales and totalPurchase (plus their
 * salesCount / purchaseCount). Stock value, receivable, payable and expenses
 * keep showing their current / all-time figures, exactly as before.
 *
 * Invoice.date and Purchase.date are stored as "YYYY-MM-DD" strings, so a
 * plain $gte / $lte string comparison is a correct date comparison.
 * Month / year / range are all turned into a startDate + endDate by the
 * frontend (which also handles BS -> AD conversion).
 */
const getDashboardSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (isProvided(startDate) && !isValidIsoDate(startDate)) {
      return res.status(400).json({
        success: false,
        message: "startDate must be a valid date in YYYY-MM-DD format",
      });
    }
    if (isProvided(endDate) && !isValidIsoDate(endDate)) {
      return res.status(400).json({
        success: false,
        message: "endDate must be a valid date in YYYY-MM-DD format",
      });
    }
    if (isProvided(startDate) && isProvided(endDate) && startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate cannot be after endDate",
      });
    }

    const dateRange = {};
    if (isProvided(startDate)) dateRange.$gte = startDate;
    if (isProvided(endDate)) dateRange.$lte = endDate;
    const hasDateFilter = Object.keys(dateRange).length > 0;

    // .aggregate() bypasses Mongoose query middleware, so unlike every other
    // query in this app it is NOT auto-scoped by the companyScope plugin —
    // it needs an explicit $match here.
    // .aggregate() does NOT auto-cast query values the way .find() does —
    // Mongoose's own docs warn about this. getCurrentCompanyId() returns a
    // plain string, so it must be explicitly converted to an ObjectId here,
    // or $match will silently never find anything.
    const companyId = new mongoose.Types.ObjectId(getCurrentCompanyId());
    const companyMatch = { company: companyId };
    const periodMatch = hasDateFilter
      ? { company: companyId, date: dateRange }
      : companyMatch;

    const products = await Product.find({}, "currentStock purchasePrice");
    const stockValue = products.reduce(
      (sum, p) => sum + p.currentStock * p.purchasePrice,
      0,
    );

    // All-time figures (receivable / payable always come from these).
    const [salesAll] = await Invoice.aggregate([
      { $match: companyMatch },
      {
        $group: {
          _id: null,
          total: { $sum: "$grandTotal" },
          due: { $sum: "$dueAmount" },
          count: { $sum: 1 },
        },
      },
    ]);
    const [purchaseAll] = await Purchase.aggregate([
      { $match: companyMatch },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          due: { $sum: "$dueAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Figures for the selected period. With no date filter they are simply
    // the all-time figures, so nothing is queried twice.
    let salesPeriod = salesAll;
    let purchasePeriod = purchaseAll;
    if (hasDateFilter) {
      [salesPeriod] = await Invoice.aggregate([
        { $match: periodMatch },
        {
          $group: {
            _id: null,
            total: { $sum: "$grandTotal" },
            count: { $sum: 1 },
          },
        },
      ]);
      [purchasePeriod] = await Purchase.aggregate([
        { $match: periodMatch },
        {
          $group: {
            _id: null,
            total: { $sum: "$total" },
            count: { $sum: 1 },
          },
        },
      ]);
    }

    const [expenseAgg] = await Expense.aggregate([
      { $match: companyMatch },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        stockValue,
        totalSales: salesPeriod?.total || 0,
        totalPurchase: purchasePeriod?.total || 0,
        salesCount: salesPeriod?.count || 0,
        purchaseCount: purchasePeriod?.count || 0,
        receivable: salesAll?.due || 0,
        payable: purchaseAll?.due || 0,
        totalExpense: expenseAgg?.total || 0,
        filter: {
          startDate: isProvided(startDate) ? startDate : "",
          endDate: isProvided(endDate) ? endDate : "",
        },
      },
    });
  } catch (error) {
    console.error("Get dashboard summary error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch dashboard summary" });
  }
};

module.exports = { getDashboardSummary };