const mongoose = require("mongoose");

const Product = require("../models/Product");
const Client = require("../models/Client");
const Invoice = require("../models/Invoice");
const Purchase = require("../models/Purchase");
const PurchaseReturn = require("../models/PurchaseReturn");
const Payment = require("../models/Payment");
const Expense = require("../models/Expense");
const StockMovement = require("../models/StockMovement");
const BalanceOpening = require("../models/BalanceOpening");
const BalanceEntry = require("../models/BalanceEntry");

const {
  ENTRY_TYPES,
  computeBalanceSheet,
  computeOpeningPosition,
  isValidIsoDate,
  addDays,
  round2,
} = require("../utils/balanceSheetCalc");

const MIN_DATE = "1900-01-01";
const MAX_DATE = "2200-12-31";
const MAX_MONEY = 1e12;

const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });


const loadData = async () => {
  const [
    products,
    clients,
    invoices,
    purchases,
    purchaseReturns,
    payments,
    expenses,
    movements,
    entries,
    opening,
  ] = await Promise.all([
    Product.find({}, "purchasePrice currentStock").lean(),
    Client.find({}, "type openingDue").lean(),
    Invoice.find(
      {},
      "date grandTotal taxableAmount vatAmount amountReceived paymentMode items.product items.quantity",
    ).lean(),
    Purchase.find(
      {},
      "product date quantity rate amountPaid paymentMethod returnedQuantity",
    ).lean(),
    PurchaseReturn.find({}, "purchase product date quantity createdAt").lean(),
    Payment.find({}, "referenceModel reference date amount method").lean(),
    Expense.find({}, "date amount paymentMethod").lean(),
    StockMovement.find(
      {},
      "product type quantity reason source createdAt",
    ).lean(),
    BalanceEntry.find({}, "type date amount method").lean(),
    BalanceOpening.findOne({}).lean(),
  ]);

  return {
    products,
    clients,
    invoices,
    purchases,
    purchaseReturns,
    payments,
    expenses,
    movements,
    entries,
    opening,
  };
};

const inRange = (value) =>
  isValidIsoDate(value) && value >= MIN_DATE && value <= MAX_DATE;

const getBalanceSheet = async (req, res) => {
  try {
    const { asOf, fyStart, prevAsOf, prevFyStart } = req.query;

    if (!inRange(asOf) || !inRange(fyStart)) {
      return fail(
        res,
        400,
        "asOf and fyStart are required and must be valid dates (YYYY-MM-DD)",
      );
    }
    if (fyStart > asOf) {
      return fail(res, 400, "The fiscal year cannot start after the date");
    }

    const hasPrevAsOf = prevAsOf !== undefined && prevAsOf !== "";
    const hasPrevFyStart = prevFyStart !== undefined && prevFyStart !== "";
    if (hasPrevAsOf !== hasPrevFyStart) {
      return fail(res, 400, "prevAsOf and prevFyStart must be sent together");
    }
    if (hasPrevAsOf) {
      if (!inRange(prevAsOf) || !inRange(prevFyStart)) {
        return fail(
          res,
          400,
          "prevAsOf and prevFyStart must be valid dates (YYYY-MM-DD)",
        );
      }
      if (prevFyStart > prevAsOf) {
        return fail(
          res,
          400,
          "The previous fiscal year cannot start after its date",
        );
      }
    }

    const data = await loadData();
    const result = computeBalanceSheet(data, {
      asOf,
      fyStart,
      prevAsOf: hasPrevAsOf ? prevAsOf : null,
      prevFyStart: hasPrevFyStart ? prevFyStart : null,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("getBalanceSheet failed:", error);
    fail(res, 500, "Failed to calculate the balance sheet");
  }
};


const OPENING_FIELDS = ["cash", "bank", "fixedAssets", "loans"];

const shapeOpening = (doc) => {
  const values = {};
  for (const field of OPENING_FIELDS) {
    values[field] = doc ? Number(doc[field]) || 0 : 0;
  }
  return values;
};

// GET /api/balance-sheet/opening
const getOpening = async (req, res) => {
  try {
    const data = await loadData();
    res.status(200).json({
      success: true,
      data: {
        isSet: Boolean(data.opening),
        values: shapeOpening(data.opening),
        // What the rest of the system contributes to the starting position.
        derived: computeOpeningPosition(data),
      },
    });
  } catch (error) {
    console.error("getOpening failed:", error);
    fail(res, 500, "Failed to fetch opening balances");
  }
};

const parseMoney = (raw, label) => {
  if (raw === undefined || raw === null || raw === "") return { value: 0 };
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { error: `${label} must be a number` };
  }
  if (value < 0) return { error: `${label} cannot be negative` };
  if (value > MAX_MONEY) return { error: `${label} is too large` };
  return { value: round2(value) };
};

// PUT /api/balance-sheet/opening
const saveOpening = async (req, res) => {
  try {
    const labels = {
      cash: "Cash in hand",
      bank: "Bank balance",
      fixedAssets: "Fixed assets",
      loans: "Loans",
    };

    const values = {};
    for (const field of OPENING_FIELDS) {
      const parsed = parseMoney(req.body[field], labels[field]);
      if (parsed.error) return fail(res, 400, parsed.error);
      values[field] = parsed.value;
    }

    const apply = async () => {
      let doc = await BalanceOpening.findOne({});
      if (!doc) doc = new BalanceOpening();
      OPENING_FIELDS.forEach((field) => {
        doc[field] = values[field];
      });
      await doc.save();
      return doc;
    };

    let doc;
    try {
      doc = await apply();
    } catch (error) {
      if (error && error.code === 11000) doc = await apply();
      else throw error;
    }

    res.status(200).json({
      success: true,
      message: "Opening balances saved",
      data: { isSet: true, values: shapeOpening(doc) },
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return fail(res, 400, message);
    }
    console.error("saveOpening failed:", error);
    fail(res, 500, "Failed to save opening balances");
  }
};

const parseEntryBody = (body) => {
  const { type, date, dateMode, amount, method, note } = body || {};

  const config = ENTRY_TYPES[type];
  if (!config) return { error: "Please choose a valid entry type" };

  if (!isValidIsoDate(date)) {
    return { error: "Please enter a valid date" };
  }
  const latest = addDays(new Date().toISOString().slice(0, 10), 1);
  if (date > latest) return { error: "Date cannot be in the future" };
  if (date < MIN_DATE) return { error: "Please enter a valid date" };

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { error: "Amount must be greater than 0" };
  }
  if (amt > MAX_MONEY) return { error: "Amount is too large" };

  let entryMethod;
  if (config.direction) {
    if (method !== "cash" && method !== "bank") {
      return { error: "Please choose Cash or Bank" };
    }
    entryMethod = method;
  }

  const cleanNote = typeof note === "string" ? note.trim() : "";
  if (cleanNote.length > 300) {
    return { error: "Note cannot be longer than 300 characters" };
  }

  return {
    values: {
      type,
      date,
      dateMode: dateMode === "AD" ? "AD" : "BS",
      amount: round2(amt),
      method: entryMethod,
      note: cleanNote,
    },
  };
};

// GET /api/balance-sheet/entries
const getEntries = async (req, res) => {
  try {
    const entries = await BalanceEntry.find({}).sort({
      date: -1,
      createdAt: -1,
    });
    res.status(200).json({ success: true, data: entries });
  } catch (error) {
    console.error("getEntries failed:", error);
    fail(res, 500, "Failed to fetch entries");
  }
};

// POST /api/balance-sheet/entries
const createEntry = async (req, res) => {
  try {
    const parsed = parseEntryBody(req.body);
    if (parsed.error) return fail(res, 400, parsed.error);

    const entry = await BalanceEntry.create(parsed.values);
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return fail(res, 400, message);
    }
    console.error("createEntry failed:", error);
    fail(res, 500, "Failed to save entry");
  }
};

// PUT /api/balance-sheet/entries/:id
const updateEntry = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 404, "Entry not found");
    }
    const entry = await BalanceEntry.findById(req.params.id);
    if (!entry) return fail(res, 404, "Entry not found");

    const parsed = parseEntryBody(req.body);
    if (parsed.error) return fail(res, 400, parsed.error);

    entry.type = parsed.values.type;
    entry.date = parsed.values.date;
    entry.dateMode = parsed.values.dateMode;
    entry.amount = parsed.values.amount;
    // Depreciation has no method; clear any old one.
    entry.method = parsed.values.method;
    entry.note = parsed.values.note;
    await entry.save();

    res.status(200).json({ success: true, data: entry });
  } catch (error) {
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return fail(res, 400, message);
    }
    console.error("updateEntry failed:", error);
    fail(res, 500, "Failed to update entry");
  }
};

// DELETE /api/balance-sheet/entries/:id
const deleteEntry = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 404, "Entry not found");
    }
    const entry = await BalanceEntry.findById(req.params.id);
    if (!entry) return fail(res, 404, "Entry not found");

    await entry.deleteOne();
    res.status(200).json({ success: true, message: "Entry deleted" });
  } catch (error) {
    console.error("deleteEntry failed:", error);
    fail(res, 500, "Failed to delete entry");
  }
};

// GET /api/balance-sheet/entry-types  (labels + help text for the form)
const getEntryTypes = (req, res) => {
  const types = Object.entries(ENTRY_TYPES).map(([value, config]) => ({
    value,
    label: config.label,
    direction: config.direction,
    help: config.help,
  }));
  res.status(200).json({ success: true, data: types });
};

module.exports = {
  getBalanceSheet,
  getOpening,
  saveOpening,
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  getEntryTypes,
};