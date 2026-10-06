const mongoose = require("mongoose");
const Receipt = require("../models/Receipt");
const Payment = require("../models/Payment");
const Invoice = require("../models/Invoice");
const Client = require("../models/Client");
const Counter = require("../models/Counter");
const { getCurrentCompanyId } = require("../utils/tenantContext");
const { round2, allocateFIFO } = require("../utils/receiptAllocation");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.isConflict = true;
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

// Hands out RCT-0001, RCT-0002 ... separately for every company. The counter
// document is bumped atomically, so two receipts saved at the same moment can
// never get the same number.
const nextReceiptNumber = async () => {
  const company = getCurrentCompanyId();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { company, key: "receipt" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      return `RCT-${String(counter.seq).padStart(4, "0")}`;
    } catch (error) {
      // Two requests raced to create the very first counter document.
      if (error.code === 11000 && attempt < 2) continue;
      throw error;
    }
  }
};

const serializeReceipt = (receipt, customerDoc) => ({
  _id: receipt._id,
  receiptNumber: receipt.receiptNumber,
  customer: customerDoc
    ? {
        _id: customerDoc._id,
        name: customerDoc.name,
        address: customerDoc.address || "",
        phone: customerDoc.phone || "",
        vatNumber: customerDoc.vatNumber || "",
      }
    : null,
  customerName: receipt.customerName || customerDoc?.name || "",
  date: receipt.date,
  dateMode: receipt.dateMode,
  amount: receipt.amount,
  method: receipt.method,
  remarks: receipt.remarks || "",
  dueBefore: receipt.dueBefore,
  dueAfter: receipt.dueAfter,
  allocations: (receipt.allocations || []).map((a) => ({
    invoice: a.invoice,
    invoiceNumber: a.invoiceNumber,
    invoiceDate: a.invoiceDate,
    invoiceDateMode: a.invoiceDateMode,
    invoiceTotal: a.invoiceTotal,
    dueBefore: a.dueBefore,
    amount: a.amount,
    dueAfter: a.dueAfter,
  })),
  createdAt: receipt.createdAt,
});

// Compare-and-set update of one invoice: only writes if the invoice still has
// the exact values we read, so a concurrent change is detected, not overwritten.
const applyInvoiceChange = async (inv, newReceived, newDue, applied) => {
  const updated = await Invoice.findOneAndUpdate(
    {
      _id: inv._id,
      amountReceived: inv.amountReceived,
      dueAmount: inv.dueAmount,
    },
    { $set: { amountReceived: newReceived, dueAmount: newDue } },
    { new: true },
  );

  if (!updated) {
    throw new ConflictError(
      `Invoice #${inv.invoiceNumber} was changed while this payment was being saved. Nothing was recorded — please reload and try again.`,
    );
  }

  applied.push({
    id: inv._id,
    prevReceived: inv.amountReceived,
    prevDue: inv.dueAmount,
    newReceived,
    newDue,
  });
};

// Puts every invoice in `applied` back to the values it had before.
const rollbackInvoices = async (applied) => {
  for (const a of [...applied].reverse()) {
    try {
      const restored = await Invoice.findOneAndUpdate(
        { _id: a.id, amountReceived: a.newReceived, dueAmount: a.newDue },
        { $set: { amountReceived: a.prevReceived, dueAmount: a.prevDue } },
      );
      if (!restored) {
        // Someone touched the invoice in the meantime — undo just our delta.
        await Invoice.findOneAndUpdate(
          { _id: a.id },
          {
            $inc: {
              amountReceived: a.prevReceived - a.newReceived,
              dueAmount: a.prevDue - a.newDue,
            },
          },
        );
      }
    } catch (rollbackError) {
      console.error(
        `CRITICAL: could not roll back invoice ${a.id} after a failed receipt:`,
        rollbackError,
      );
    }
  }
};

// Shared validation for the body of create/update.
const parsePaymentBody = (body) => {
  const { date, dateMode, amount, method, remarks } = body;

  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return { error: "Please provide a valid date (YYYY-MM-DD)" };
  }
  if (!["cash", "bank"].includes(method)) {
    return { error: "Method must be 'cash' or 'bank'" };
  }
  const amt = round2(amount);
  if (!Number.isFinite(amt) || amt < 0.01) {
    return { error: "Amount must be greater than 0" };
  }

  return {
    values: {
      date,
      dateMode: dateMode === "AD" ? "AD" : "BS",
      amount: amt,
      method,
      remarks,
    },
  };
};

const invoiceStatus = (invoice) => {
  if (round2(invoice.dueAmount) <= 0) return "paid";
  if (round2(invoice.amountReceived) > 0) return "partial";
  return "unpaid";
};

/* -------------------------------------------------------------------------- */
/* Customer summary (account statement)                                       */
/* -------------------------------------------------------------------------- */

const getCustomerSummary = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const customer = await Client.findById(req.params.id);
    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }
    if (customer.type !== "customer") {
      return res.status(400).json({
        success: false,
        message: "An account summary is only available for customers",
      });
    }

    // Deliberately plain .find() calls (not .aggregate()) so the companyScope
    // plugin scopes every query to the logged-in company automatically.
    const [invoices, payments, receipts] = await Promise.all([
      Invoice.find({ customer: customer._id }).sort({
        date: 1,
        createdAt: 1,
        _id: 1,
      }),
      Payment.find({ client: customer._id, referenceModel: "Invoice" }),
      Receipt.find({ customer: customer._id }),
    ]);

    // How much of each invoice was paid through Payment records.
    const paidViaPayments = new Map();
    for (const p of payments) {
      const key = String(p.reference);
      paidViaPayments.set(key, round2((paidViaPayments.get(key) || 0) + p.amount));
    }

    const invoiceById = new Map(invoices.map((i) => [String(i._id), i]));

    const invoiceRows = invoices.map((inv) => {
      const viaPayments = paidViaPayments.get(String(inv._id)) || 0;
      return {
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        dateMode: inv.dateMode,
        grandTotal: round2(inv.grandTotal),
        amountReceived: round2(inv.amountReceived),
        // Whatever was received when the invoice was created (before any
        // separate payment was recorded against it).
        receivedAtSale: Math.max(0, round2(inv.amountReceived - viaPayments)),
        dueAmount: round2(inv.dueAmount),
        status: invoiceStatus(inv),
      };
    });

    const history = [];

    for (const r of receipts) {
      history.push({
        kind: "receipt",
        id: r._id,
        receiptNumber: r.receiptNumber,
        date: r.date,
        dateMode: r.dateMode,
        amount: r.amount,
        method: r.method,
        remarks: r.remarks || "",
        appliedTo: r.allocations.map((a) => ({
          invoiceNumber: a.invoiceNumber,
          amount: a.amount,
        })),
        createdAt: r.createdAt,
      });
    }

    // Payments recorded the old way (one payment -> one invoice).
    for (const p of payments) {
      if (p.receipt) continue; // already shown as part of its receipt
      history.push({
        kind: "payment",
        id: p._id,
        receiptNumber: null,
        date: p.date,
        dateMode: p.dateMode,
        amount: p.amount,
        method: p.method,
        remarks: p.remarks || "",
        appliedTo: [
          {
            invoiceNumber:
              invoiceById.get(String(p.reference))?.invoiceNumber ||
              "(deleted invoice)",
            amount: p.amount,
          },
        ],
        createdAt: p.createdAt,
      });
    }

    // Money received at the time the invoice was issued.
    for (const row of invoiceRows) {
      if (row.receivedAtSale >= 0.01) {
        history.push({
          kind: "at_sale",
          id: row._id,
          receiptNumber: null,
          date: row.date,
          dateMode: row.dateMode,
          amount: row.receivedAtSale,
          method: null,
          remarks: "Received when the invoice was issued",
          appliedTo: [
            { invoiceNumber: row.invoiceNumber, amount: row.receivedAtSale },
          ],
          createdAt: invoiceById.get(String(row._id))?.createdAt,
        });
      }
    }

    // Newest first (dates are YYYY-MM-DD strings, so plain comparison works).
    history.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    const sum = (rows, field) =>
      round2(rows.reduce((total, row) => total + row[field], 0));

    res.status(200).json({
      success: true,
      data: {
        customer: {
          _id: customer._id,
          name: customer.name,
          phone: customer.phone || "",
          address: customer.address || "",
          vatNumber: customer.vatNumber || "",
          customerCategory: customer.customerCategory,
        },
        totals: {
          totalBilled: sum(invoiceRows, "grandTotal"),
          totalReceived: sum(invoiceRows, "amountReceived"),
          totalDue: sum(invoiceRows, "dueAmount"),
          invoiceCount: invoiceRows.length,
          openInvoiceCount: invoiceRows.filter((i) => i.dueAmount > 0).length,
          receiptCount: receipts.length,
        },
        invoices: invoiceRows,
        history,
      },
    });
  } catch (error) {
    console.error("Get customer summary error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch customer summary" });
  }
};

/* -------------------------------------------------------------------------- */
/* Receipts                                                                   */
/* -------------------------------------------------------------------------- */

const getReceipts = async (req, res) => {
  try {
    const { customer } = req.query;
    const filter = {};
    if (customer) {
      if (!mongoose.isValidObjectId(customer)) {
        return res.status(200).json({ success: true, data: [] });
      }
      filter.customer = customer;
    }

    const receipts = await Receipt.find(filter)
      .populate("customer", "name address phone vatNumber")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: receipts.map((r) => serializeReceipt(r, r.customer)),
    });
  } catch (error) {
    console.error("Get receipts error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch receipts" });
  }
};

const getReceiptById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res
        .status(404)
        .json({ success: false, message: "Receipt not found" });
    }

    const receipt = await Receipt.findById(req.params.id).populate(
      "customer",
      "name address phone vatNumber",
    );

    if (!receipt) {
      return res
        .status(404)
        .json({ success: false, message: "Receipt not found" });
    }

    res
      .status(200)
      .json({ success: true, data: serializeReceipt(receipt, receipt.customer) });
  } catch (error) {
    console.error("Get receipt error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch receipt" });
  }
};

/**
 * Records ONE payment from a customer and spreads it over their unpaid
 * invoices, oldest first. The customer doesn't have to say which invoice the
 * money is for — it simply reduces their total receivable.
 *
 * There are no multi-document transactions here (the rest of the app doesn't
 * use them either, and they'd require a replica set). Instead every invoice is
 * updated with a compare-and-set, so a concurrent change is detected instead of
 * silently overwritten, and everything already applied is rolled back if any
 * later step fails.
 */
const createReceipt = async (req, res) => {
  const applied = []; // invoice updates already written, needed for rollback
  let receipt = null;

  const rollback = async () => {
    await rollbackInvoices(applied);
    if (receipt) {
      await Payment.deleteMany({ receipt: receipt._id }).catch(() => {});
      await Receipt.deleteOne({ _id: receipt._id }).catch(() => {});
    }
  };

  try {
    const { customerId } = req.body;

    if (!customerId || !mongoose.isValidObjectId(customerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Customer is required" });
    }

    const parsed = parsePaymentBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }
    const { date, dateMode, amount: amt, method, remarks } = parsed.values;

    const customer = await Client.findById(customerId);
    if (!customer || customer.type !== "customer") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid customer" });
    }

    // Oldest invoice first; ties broken by creation order.
    const openInvoices = (
      await Invoice.find({
        customer: customer._id,
        dueAmount: { $gt: 0 },
      }).sort({ date: 1, createdAt: 1, _id: 1 })
    ).filter((inv) => round2(inv.dueAmount) >= 0.01);

    if (openInvoices.length === 0) {
      return res.status(400).json({
        success: false,
        message: `${customer.name} has no outstanding balance.`,
      });
    }

    const totalDue = round2(
      openInvoices.reduce((total, inv) => total + round2(inv.dueAmount), 0),
    );

    if (amt > totalDue) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot exceed the customer's total receivable (${totalDue.toLocaleString()}).`,
      });
    }

    const plan = allocateFIFO(
      openInvoices.map((inv) => ({ id: inv._id, due: inv.dueAmount })),
      amt,
    );
    const invoiceById = new Map(openInvoices.map((i) => [String(i._id), i]));

    // Step 1 — reduce the due amount on each invoice (compare-and-set).
    for (const line of plan) {
      const inv = invoiceById.get(String(line.id));
      await applyInvoiceChange(
        inv,
        round2(inv.amountReceived + line.amount),
        round2(inv.dueAmount - line.amount),
        applied,
      );
    }

    // Step 2 — the receipt itself (a permanent snapshot of what was settled).
    const receiptNumber = await nextReceiptNumber();

    receipt = await Receipt.create({
      receiptNumber,
      customer: customer._id,
      customerName: customer.name,
      date,
      dateMode,
      amount: amt,
      method,
      remarks,
      dueBefore: totalDue,
      dueAfter: round2(totalDue - amt),
      allocations: plan.map((line) => {
        const inv = invoiceById.get(String(line.id));
        return {
          invoice: inv._id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.date,
          invoiceDateMode: inv.dateMode,
          invoiceTotal: round2(inv.grandTotal),
          dueBefore: line.dueBefore,
          amount: line.amount,
          dueAfter: line.dueAfter,
        };
      }),
    });

    // Step 3 — one Payment record per invoice touched, so the existing
    // Hisab-Kitab list and any per-invoice payment history keep working.
    await Payment.create(
      plan.map((line) => ({
        referenceModel: "Invoice",
        reference: line.id,
        client: customer._id,
        date,
        dateMode,
        amount: line.amount,
        method,
        remarks,
        receipt: receipt._id,
      })),
    );

    res.status(201).json({
      success: true,
      message: "Payment received and receipt generated",
      data: serializeReceipt(receipt, customer),
    });
  } catch (error) {
    console.error("Create receipt error:", error);
    await rollback();

    if (error.isConflict) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to record payment" });
  }
};

/**
 * Edits a receipt (date, amount, method, remarks). The customer stays the same.
 *
 * It works out what the customer's invoices would look like if this receipt had
 * never been recorded, re-splits the NEW amount over them oldest-first, and then
 * moves each affected invoice from its current state to the new one. Everything
 * is validated before anything is written, and a failure part-way rolls the
 * invoices back, so a rejected edit leaves the books exactly as they were.
 */
const updateReceipt = async (req, res) => {
  const applied = [];
  let newPaymentIds = [];

  const undo = async () => {
    await rollbackInvoices(applied);
    if (newPaymentIds.length) {
      await Payment.deleteMany({ _id: { $in: newPaymentIds } }).catch(() => {});
    }
  };

  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res
        .status(404)
        .json({ success: false, message: "Receipt not found" });
    }

    const receipt = await Receipt.findById(req.params.id);
    if (!receipt) {
      return res
        .status(404)
        .json({ success: false, message: "Receipt not found" });
    }

    const parsed = parsePaymentBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }
    const { date, dateMode, amount: amt, method, remarks } = parsed.values;

    const customer = await Client.findById(receipt.customer);
    if (!customer) {
      return res.status(400).json({
        success: false,
        message:
          "This receipt's customer no longer exists, so it can't be edited.",
      });
    }

    const oldByInvoice = new Map(
      receipt.allocations.map((a) => [String(a.invoice), a.amount]),
    );

    const invoices = await Invoice.find({ customer: customer._id }).sort({
      date: 1,
      createdAt: 1,
      _id: 1,
    });

    // The invoices as they'd be without this receipt.
    const without = invoices
      .map((inv) => ({
        inv,
        due: round2(inv.dueAmount + (oldByInvoice.get(String(inv._id)) || 0)),
      }))
      .filter((v) => v.due >= 0.01);

    const totalAvailable = round2(without.reduce((t, v) => t + v.due, 0));
    if (amt > totalAvailable) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot exceed the customer's total receivable (${totalAvailable.toLocaleString()}).`,
      });
    }

    const plan = allocateFIFO(
      without.map((v) => ({ id: v.inv._id, due: v.due })),
      amt,
    );
    const newByInvoice = new Map(plan.map((l) => [String(l.id), l.amount]));
    const withoutById = new Map(without.map((v) => [String(v.inv._id), v]));

    const oldPayments = await Payment.find({ receipt: receipt._id });
    const oldPaymentIds = oldPayments.map((p) => p._id);

    // Step 1 — move every affected invoice from the old split to the new one.
    for (const inv of invoices) {
      const key = String(inv._id);
      const oldAmt = oldByInvoice.get(key) || 0;
      const newAmt = newByInvoice.get(key) || 0;
      if (oldAmt === 0 && newAmt === 0) continue;
      if (oldAmt === newAmt) continue;

      await applyInvoiceChange(
        inv,
        Math.max(0, round2(inv.amountReceived - oldAmt + newAmt)),
        Math.min(round2(inv.dueAmount + oldAmt - newAmt), inv.grandTotal),
        applied,
      );
    }

    // Step 2 — the new ledger entries (old ones are removed only at the end).
    const created = await Payment.create(
      plan.map((line) => ({
        referenceModel: "Invoice",
        reference: line.id,
        client: customer._id,
        date,
        dateMode,
        amount: line.amount,
        method,
        remarks,
        receipt: receipt._id,
      })),
    );
    newPaymentIds = created.map((p) => p._id);

    // Step 3 — update the receipt itself.
    receipt.date = date;
    receipt.dateMode = dateMode;
    receipt.amount = amt;
    receipt.method = method;
    receipt.remarks = remarks;
    receipt.customerName = customer.name;
    receipt.dueBefore = totalAvailable;
    receipt.dueAfter = round2(totalAvailable - amt);
    receipt.allocations = plan.map((line) => {
      const v = withoutById.get(String(line.id));
      return {
        invoice: v.inv._id,
        invoiceNumber: v.inv.invoiceNumber,
        invoiceDate: v.inv.date,
        invoiceDateMode: v.inv.dateMode,
        invoiceTotal: round2(v.inv.grandTotal),
        dueBefore: line.dueBefore,
        amount: line.amount,
        dueAfter: line.dueAfter,
      };
    });
    await receipt.save();

    // Step 4 — the edit is now complete; drop the old ledger entries.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await Payment.deleteMany({ _id: { $in: oldPaymentIds } });
        break;
      } catch (cleanupError) {
        if (attempt === 1) {
          console.error(
            `CRITICAL: receipt ${receipt.receiptNumber} was updated but its old payment records could not be removed:`,
            cleanupError,
          );
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Receipt updated successfully",
      data: serializeReceipt(receipt, customer),
    });
  } catch (error) {
    console.error("Update receipt error:", error);
    await undo();

    if (error.isConflict) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to update receipt" });
  }
};

/**
 * Deleting a receipt puts every invoice it paid back the way it was.
 * (The receipt number is not reused.)
 */
const deleteReceipt = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res
        .status(404)
        .json({ success: false, message: "Receipt not found" });
    }

    const receipt = await Receipt.findById(req.params.id);
    if (!receipt) {
      return res
        .status(404)
        .json({ success: false, message: "Receipt not found" });
    }

    for (const line of receipt.allocations) {
      const invoice = await Invoice.findById(line.invoice);
      if (!invoice) continue; // invoice no longer exists — nothing to restore

      invoice.amountReceived = Math.max(
        0,
        round2(invoice.amountReceived - line.amount),
      );
      invoice.dueAmount = Math.min(
        round2(invoice.dueAmount + line.amount),
        invoice.grandTotal,
      );
      await invoice.save();
    }

    await Payment.deleteMany({ receipt: receipt._id });
    await receipt.deleteOne();

    res
      .status(200)
      .json({ success: true, message: "Receipt deleted successfully" });
  } catch (error) {
    console.error("Delete receipt error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete receipt" });
  }
};

module.exports = {
  getCustomerSummary,
  getReceipts,
  getReceiptById,
  createReceipt,
  updateReceipt,
  deleteReceipt,
};
