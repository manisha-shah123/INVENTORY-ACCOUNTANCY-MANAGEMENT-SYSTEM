const mongoose = require("mongoose");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const Client = require("../models/Client");
const StockMovement = require("../models/StockMovement");
const PurchaseReturn = require("../models/PurchaseReturn");
const Payment = require("../models/Payment");

const MAX_LABEL_LENGTH = 100;
const MAX_REMARKS_LENGTH = 300;

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

const getPurchases = async (req, res) => {
  try {
    const { supplier, product } = req.query;
    const filter = {};
    if (supplier) filter.supplier = supplier;
    if (product) filter.product = product;

    const purchases = await Purchase.find(filter)
      .populate("supplier", "name")
      .populate("product", "name sku unit")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: purchases });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch purchases" });
  }
};

const getPurchaseById = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate("supplier", "name")
      .populate("product", "name sku unit");

    if (!purchase) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase not found" });
    }

    res.status(200).json({ success: true, data: purchase });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch purchase" });
  }
};

const createPurchase = async (req, res) => {
  try {
    const {
      supplierId,
      productId,
      date,
      dateMode,
      invoiceNumber,
      quantity,
      rate,
      amountPaid,
      paymentMethod,
      grade,
      size,
      remarks,
    } = req.body;

    if (
      !supplierId ||
      !productId ||
      !date ||
      !invoiceNumber ||
      !invoiceNumber.trim() ||
      !quantity ||
      rate === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Supplier, product, date, invoice number, quantity, and rate are required",
      });
    }

    const qty = Number(quantity);
    const rateNum = Number(rate);
    const paid = Number(amountPaid) || 0;

    if (!Number.isFinite(qty) || qty <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Quantity must be greater than 0" });
    }
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      return res
        .status(400)
        .json({ success: false, message: "Rate cannot be negative" });
    }

    const gradeText = cleanText(grade);
    const sizeText = cleanText(size);
    const remarksText = cleanText(remarks);

    if (gradeText.length > MAX_LABEL_LENGTH || sizeText.length > MAX_LABEL_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Grade and size must be ${MAX_LABEL_LENGTH} characters or fewer`,
      });
    }
    if (remarksText.length > MAX_REMARKS_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Remarks must be ${MAX_REMARKS_LENGTH} characters or fewer`,
      });
    }

    const total = qty * rateNum;

    if (paid < 0) {
      return res
        .status(400)
        .json({ success: false, message: "Amount paid cannot be negative" });
    }
    if (paid > total) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Amount paid cannot exceed the total amount",
        });
    }

    if (
      paymentMethod !== undefined &&
      paymentMethod !== "" &&
      !["cash", "bank"].includes(paymentMethod)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment method must be 'cash' or 'bank'",
      });
    }

    const supplier = await Client.findById(supplierId);
    if (!supplier || supplier.type !== "supplier") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid supplier" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product" });
    }

    const purchase = await Purchase.create({
      supplier: supplierId,
      product: productId,
      date,
      dateMode: dateMode === "AD" ? "AD" : "BS",
      invoiceNumber: invoiceNumber.trim(),
      grade: gradeText,
      size: sizeText,
      remarks: remarksText,
      quantity: qty,
      rate: rateNum,
      total,
      amountPaid: paid,
      paymentMethod: paymentMethod === "bank" ? "bank" : "cash",
      dueAmount: total - paid,
    });

    const newStock = product.currentStock + qty;
    product.currentStock = newStock;
    await product.save();

    await StockMovement.create({
      product: product._id,
      type: "in",
      quantity: qty,
      reason: `Purchase from ${supplier.name} (Inv #${purchase.invoiceNumber})`,
      source: "purchase",
      balanceAfter: newStock,
    });

    const populatedPurchase = await Purchase.findById(purchase._id)
      .populate("supplier", "name")
      .populate("product", "name sku unit");

    res.status(201).json({
      success: true,
      message: "Purchase recorded successfully",
      data: populatedPurchase,
    });
  } catch (error) {
    console.error("Create purchase error:", error);
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to create purchase" });
  }
};

const deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase not found" });
    }

    // Payments recorded in Hisab-Kitab point at this purchase. Deleting it
    // would leave them dangling and throw the supplier's account out of
    // balance (same rule invoices already follow).
    const paymentCount = await Payment.countDocuments({
      referenceModel: "Purchase",
      reference: purchase._id,
    });
    if (paymentCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Purchase (Inv #${purchase.invoiceNumber}) has ${paymentCount} payment${paymentCount === 1 ? "" : "s"} recorded against it. Delete the payment(s) in Hisab-Kitab first, then delete the purchase.`,
      });
    }

    const product = await Product.findById(purchase.product);

    if (purchase.returnedQuantity > 0) {
      return res.status(400).json({
        success: false,
        message:
          "This purchase has returns recorded against it and can't be deleted. Delete or reverse the returns first.",
      });
    }

    if (product) {
      if (product.currentStock < purchase.quantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete this purchase — only ${product.currentStock} ${product.unit} left in stock, but this purchase added ${purchase.quantity}. Some of it has already been sold or used elsewhere.`,
        });
      }

      const newStock = product.currentStock - purchase.quantity;
      product.currentStock = newStock;
      await product.save();

      await StockMovement.create({
        product: product._id,
        type: "out",
        quantity: purchase.quantity,
        reason: `Purchase deleted (was Inv #${purchase.invoiceNumber})`,
        source: "purchase",
        balanceAfter: newStock,
      });
    }

    await purchase.deleteOne();

    res
      .status(200)
      .json({ success: true, message: "Purchase deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete purchase" });
  }
};

// Edits only the descriptive labels of a purchase (grade, size, remarks).
// Quantity, rate and money are untouched, so stock and the supplier's account
// can't be thrown off — this only changes how the entry is grouped in the
// Stock Summary. Handy for tagging purchases recorded before grade/size existed.
const updatePurchaseDetails = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase not found" });
    }

    const grade = cleanText(req.body.grade);
    const size = cleanText(req.body.size);
    const remarks = cleanText(req.body.remarks);

    if (grade.length > MAX_LABEL_LENGTH || size.length > MAX_LABEL_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Grade and size must be ${MAX_LABEL_LENGTH} characters or fewer`,
      });
    }
    if (remarks.length > MAX_REMARKS_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Remarks must be ${MAX_REMARKS_LENGTH} characters or fewer`,
      });
    }

    const purchase = await Purchase.findByIdAndUpdate(
      req.params.id,
      { $set: { grade, size, remarks } },
      { new: true, runValidators: true },
    )
      .populate("supplier", "name")
      .populate("product", "name sku unit");

    if (!purchase) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase not found" });
    }

    res.status(200).json({
      success: true,
      message: "Purchase details updated",
      data: purchase,
    });
  } catch (error) {
    console.error("Update purchase details error:", error);
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to update purchase details" });
  }
};

const createPurchaseReturn = async (req, res) => {
  try {
    const { quantity, date, dateMode, reason } = req.body;

    const purchase = await Purchase.findById(req.params.id).populate(
      "supplier",
      "name",
    );
    if (!purchase) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase not found" });
    }

    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: "Date is required" });
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a whole number greater than 0",
      });
    }

    const alreadyReturned = purchase.returnedQuantity || 0;
    const returnable = purchase.quantity - alreadyReturned;

    if (qty > returnable) {
      return res.status(400).json({
        success: false,
        message: `Cannot return ${qty} — only ${returnable} left returnable on this purchase (Inv #${purchase.invoiceNumber}).`,
      });
    }

    const product = await Product.findById(purchase.product);
    if (!product) {
      return res
        .status(400)
        .json({ success: false, message: "Product not found" });
    }

    if (qty > product.currentStock) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock to return. Only ${product.currentStock} ${product.unit} available.`,
      });
    }

    const amount = qty * purchase.rate;

    purchase.returnedQuantity = alreadyReturned + qty;
    purchase.total = Math.max(0, purchase.total - amount);
    purchase.dueAmount = Math.max(0, purchase.total - purchase.amountPaid);
    await purchase.save();

    const newStock = product.currentStock - qty;
    product.currentStock = newStock;
    await product.save();

    const trimmedReason = (reason || "").trim();

    const movement = await StockMovement.create({
      product: product._id,
      type: "out",
      quantity: qty,
      reason:
        trimmedReason ||
        `Purchase return to ${purchase.supplier.name} (Inv #${purchase.invoiceNumber})`,
      source: "purchase_return",
      balanceAfter: newStock,
    });

    const purchaseReturn = await PurchaseReturn.create({
      purchase: purchase._id,
      product: product._id,
      supplier: purchase.supplier._id,
      date,
      dateMode: dateMode === "AD" ? "AD" : "BS",
      quantity: qty,
      rate: purchase.rate,
      amount,
      reason: trimmedReason,
    });

    res.status(201).json({
      success: true,
      message: "Purchase return recorded successfully",
      data: { purchase, product, movement, purchaseReturn },
    });
  } catch (error) {
    console.error("Create purchase return error:", error);
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to record purchase return" });
  }
};

module.exports = {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchaseDetails,
  createPurchaseReturn,
  deletePurchase,
};