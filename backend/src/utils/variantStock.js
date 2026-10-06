const Purchase = require("../models/Purchase");
const Invoice = require("../models/Invoice");
const StockMovement = require("../models/StockMovement");

// productController writes exactly this reason when a product is created
// with an opening stock — same constant stockSummaryController.js uses.
const OPENING_STOCK_REASON = "Opening stock";

const clean = (value) => (typeof value === "string" ? value.trim() : "");
// Grade/size are matched ignoring case and surrounding spaces, same as
// Stock Summary, so "5W30" and " 5w30 " are treated as the same variant.
const norm = (value) => clean(value).toLowerCase();

// Round to 2 decimals (the trailing "+ 0" turns -0 into 0).
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100 + 0;


const getVariantAvailability = async (
  productId,
  grade,
  size,
  { excludeInvoiceId } = {},
) => {
  const gradeKey = norm(grade);
  const sizeKey = norm(size);
  const isBlankVariant = gradeKey === "" && sizeKey === "";

  const [purchases, invoices, openingMoves] = await Promise.all([
    Purchase.find({ product: productId }),
    Invoice.find({ "items.product": productId }),
    // Opening stock is always recorded with no grade/size (see
    // productController + stockSummaryController), so it only ever
    // belongs to the blank/blank variant.
    isBlankVariant
      ? StockMovement.find({
          product: productId,
          type: "in",
          reason: OPENING_STOCK_REASON,
        })
      : Promise.resolve([]),
  ]);

  let totalStock = 0;
  for (const purchase of purchases) {
    if (norm(purchase.grade) !== gradeKey || norm(purchase.size) !== sizeKey) {
      continue;
    }
    totalStock += (purchase.quantity || 0) - (purchase.returnedQuantity || 0);
  }
  for (const move of openingMoves) {
    totalStock += move.quantity || 0;
  }

  let totalSold = 0;
  for (const invoice of invoices) {
    if (excludeInvoiceId && String(invoice._id) === String(excludeInvoiceId)) {
      continue;
    }
    for (const item of invoice.items || []) {
      if (!item.product || String(item.product) !== String(productId)) continue;
      if (norm(item.grade) !== gradeKey || norm(item.size) !== sizeKey) continue;
      totalSold += item.quantity || 0;
    }
  }

  totalStock = round2(totalStock);
  totalSold = round2(totalSold);

  return {
    totalStock,
    totalSold,
    remaining: round2(totalStock - totalSold),
  };
};

/**
 * All grade/size variants of one product that currently have stock left,
 * biggest remaining first. Used to tell the user what they CAN sell when
 * getVariantAvailability blocks what they asked for — a plain "0
 * available" message doesn't help anyone pick a valid grade/size.
 */
const getProductAvailableVariants = async (
  productId,
  { excludeInvoiceId } = {},
) => {
  const [purchases, invoices, openingMoves] = await Promise.all([
    Purchase.find({ product: productId }),
    Invoice.find({ "items.product": productId }),
    StockMovement.find({
      product: productId,
      type: "in",
      reason: OPENING_STOCK_REASON,
    }),
  ]);

  const variants = new Map();
  const getEntry = (grade, size) => {
    const gradeText = clean(grade);
    const sizeText = clean(size);
    const key = `${gradeText.toLowerCase()}::${sizeText.toLowerCase()}`;
    let entry = variants.get(key);
    if (!entry) {
      entry = { grade: gradeText, size: sizeText, totalStock: 0, totalSold: 0 };
      variants.set(key, entry);
    }
    return entry;
  };

  for (const move of openingMoves) {
    getEntry("", "").totalStock += move.quantity || 0;
  }
  for (const purchase of purchases) {
    const entry = getEntry(purchase.grade, purchase.size);
    entry.totalStock += (purchase.quantity || 0) - (purchase.returnedQuantity || 0);
  }
  for (const invoice of invoices) {
    if (excludeInvoiceId && String(invoice._id) === String(excludeInvoiceId)) {
      continue;
    }
    for (const item of invoice.items || []) {
      if (!item.product || String(item.product) !== String(productId)) continue;
      getEntry(item.grade, item.size).totalSold += item.quantity || 0;
    }
  }

  return [...variants.values()]
    .map((entry) => ({
      grade: entry.grade,
      size: entry.size,
      remaining: round2(entry.totalStock - entry.totalSold),
    }))
    .filter((entry) => entry.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);
};

module.exports = { getVariantAvailability, getProductAvailableVariants };