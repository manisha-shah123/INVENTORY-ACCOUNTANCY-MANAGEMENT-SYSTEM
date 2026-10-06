const Payment = require("../models/Payment");
const Purchase = require("../models/Purchase");
const Invoice = require("../models/Invoice");
const Client = require("../models/Client");
require("../models/Sale"); // legacy model, kept only so old payments can be read
const MODEL_BY_TYPE = { purchase: Purchase, invoice: Invoice };

const getPayments = async (req, res) => {
  try {
    const { client } = req.query;
    const filter = {};
    if (client) filter.client = client;

    // The Hisab-Kitab list shows the customer type and searches on the
    // client's contact details, so it needs more than just the name.
    const payments = await Payment.find(filter)
      .populate(
        "client",
        "name type customerCategory phone email city country address vatNumber",
      )
      .populate("reference")
      .populate("receipt", "receiptNumber amount")
      .sort({ createdAt: -1 });

       res.status(200).json({ success: true, data: payments });
  } catch (error) {
    console.error("Get payments error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch payments" });
  }
};

const getPendingInvoices = async (req, res) => {
  try {
    const { type, clientId } = req.query;

    if (!["purchase", "invoice"].includes(type)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Type must be 'purchase' or 'invoice'",
        });
    }
    if (!clientId) {
      return res
        .status(400)
        .json({ success: false, message: "clientId is required" });
    }

    const Model = MODEL_BY_TYPE[type];
    const filterField = type === "purchase" ? "supplier" : "customer";

    const invoices = await Model.find({
      [filterField]: clientId,
      dueAmount: { $gt: 0 },
    }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: invoices });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch pending invoices" });
  }
};

const getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate("client", "name")
      .populate("reference")
      .populate("receipt", "receiptNumber amount");

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch payment" });
  }
};

const createPayment = async (req, res) => {
  try {
    const { type, invoiceId, clientId, date, dateMode, amount, method, remarks } =
      req.body;

    if (!["purchase", "invoice"].includes(type)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Type must be 'purchase' or 'invoice'",
        });
    }
    if (!invoiceId || !clientId || !date || amount === undefined || !method) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }
    if (!["cash", "bank"].includes(method)) {
      return res
        .status(400)
        .json({ success: false, message: "Method must be 'cash' or 'bank'" });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Amount must be greater than 0" });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid client" });
    }

    const Model = MODEL_BY_TYPE[type];
    const invoiceDoc = await Model.findById(invoiceId);
    if (!invoiceDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Invoice not found" });
    }

    if (amt > invoiceDoc.dueAmount) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot exceed the due amount (${invoiceDoc.dueAmount}).`,
      });
    }

    if (type === "purchase") {
      invoiceDoc.amountPaid += amt;
    } else {
      invoiceDoc.amountReceived += amt;
    }
    invoiceDoc.dueAmount -= amt;
    await invoiceDoc.save();

    const payment = await Payment.create({
      referenceModel: type === "purchase" ? "Purchase" : "Invoice",
      reference: invoiceDoc._id,
      client: clientId,
      date,
      dateMode: dateMode === "AD" ? "AD" : "BS",
      amount: amt,
      method,
      remarks,
    });

    const populatedPayment = await Payment.findById(payment._id)
      .populate("client", "name")
      .populate("reference");

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: populatedPayment,
    });
  } catch (error) {
    console.error("Create payment error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to record payment" });
  }
};

const updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    if (payment.receipt) {
      return res.status(400).json({
        success: false,
        message:
          "This payment is part of a receipt covering several invoices, so it can't be edited on its own. Open its receipt in Hisab-Kitab and use Edit Receipt.",
      });
    }

    const { type, invoiceId, clientId, date, dateMode, amount, method, remarks } =
      req.body;

    if (!["purchase", "invoice"].includes(type)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Type must be 'purchase' or 'invoice'",
        });
    }
    if (!invoiceId || !clientId || !date || amount === undefined || !method) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }
    if (!["cash", "bank"].includes(method)) {
      return res
        .status(400)
        .json({ success: false, message: "Method must be 'cash' or 'bank'" });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Amount must be greater than 0" });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid client" });
    }

    // Load both the invoice/purchase this payment currently applies to and the
    // one it should apply to after the edit, and validate BEFORE changing
    // anything — otherwise a rejected edit would leave the old payment already
    // reversed and the due amount permanently wrong.
    const OldModel = payment.referenceModel === "Purchase" ? Purchase : Invoice;
    const oldDoc = await OldModel.findById(payment.reference);

    const Model = MODEL_BY_TYPE[type];
    const sameDoc =
      Boolean(oldDoc) &&
      Model === OldModel &&
      String(oldDoc._id) === String(invoiceId);
    const invoiceDoc = sameDoc ? oldDoc : await Model.findById(invoiceId);
    if (!invoiceDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Invoice not found" });
    }

    // If the payment stays on the same invoice, its old amount is given back first.
    const availableDue = invoiceDoc.dueAmount + (sameDoc ? payment.amount : 0);
    if (amt > availableDue) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot exceed the due amount (${availableDue}).`,
      });
    }

    // Everything checks out — reverse the old effect, then apply the new one.
    if (oldDoc) {
      if (payment.referenceModel === "Purchase") {
        oldDoc.amountPaid -= payment.amount;
      } else {
        oldDoc.amountReceived -= payment.amount;
      }
      oldDoc.dueAmount += payment.amount;
      if (!sameDoc) await oldDoc.save();
    }

    if (type === "purchase") {
      invoiceDoc.amountPaid += amt;
    } else {
      invoiceDoc.amountReceived += amt;
    }
    invoiceDoc.dueAmount -= amt;
    await invoiceDoc.save();

    payment.referenceModel = type === "purchase" ? "Purchase" : "Invoice";
    payment.reference = invoiceDoc._id;
    payment.client = clientId;
    payment.date = date;
    payment.dateMode = dateMode === "AD" ? "AD" : "BS";
    payment.amount = amt;
    payment.method = method;
    payment.remarks = remarks;

    await payment.save();

    const populatedPayment = await Payment.findById(payment._id)
      .populate("client", "name")
      .populate("reference");

    res.status(200).json({
      success: true,
      message: "Payment updated successfully",
      data: populatedPayment,
    });
  } catch (error) {
    console.error("Update payment error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update payment" });
  }
};

const deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    if (payment.receipt) {
      return res.status(400).json({
        success: false,
        message:
          "This payment is part of a receipt covering several invoices, so it can't be deleted on its own. Delete the whole receipt from Hisab-Kitab instead.",
      });
    }

    const Model = payment.referenceModel === "Purchase" ? Purchase : Invoice;
    const invoiceDoc = await Model.findById(payment.reference);

    if (invoiceDoc) {
      if (payment.referenceModel === "Purchase") {
        invoiceDoc.amountPaid -= payment.amount;
      } else {
        invoiceDoc.amountReceived -= payment.amount;
      }
      invoiceDoc.dueAmount += payment.amount;
      await invoiceDoc.save();
    }

    await payment.deleteOne();

    res
      .status(200)
      .json({ success: true, message: "Payment deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete payment" });
  }
};

module.exports = {
  getPayments,
  getPendingInvoices,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
};