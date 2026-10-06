const Purchase = require("../models/Purchase");
const Invoice = require("../models/Invoice");
const StockMovement = require("../models/StockMovement");

// productController writes exactly this reason when a product is created with
// an opening stock, so it's how those entries are recognised here.
const OPENING_STOCK_REASON = "Opening stock";

// Round to 2 decimals (the trailing "+ 0" turns -0 into 0).
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100 + 0;

const clean = (value) => (typeof value === "string" ? value.trim() : "");

const compareText = (a, b) =>
  String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });

/**
 * Turns raw purchases / invoices / opening-stock movements into one group per
 * Product + Grade + Size, each holding:
 *   - stockEntries : every stock-in (purchases + opening stock)
 *   - sales        : every invoice that sold this variant (one row per invoice)
 *   - totalStock / totalSold / remaining
 *
 * Grade and size are matched ignoring case and surrounding spaces, so
 * "3.5L" and "3.5l " land in the same group.
 *
 * Expects `product` / `supplier` / `customer` to be populated. Records whose
 * product no longer exists are skipped.
 */
const buildStockSummary = ({
  purchases = [],
  invoices = [],
  openingMoves = [],
}) => {
  const groups = new Map();

  const getGroup = (product, grade, size) => {
    const gradeText = clean(grade);
    const sizeText = clean(size);
    const key = JSON.stringify([
      String(product._id),
      gradeText.toLowerCase(),
      sizeText.toLowerCase(),
    ]);

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        productId: String(product._id),
        productName: product.name,
        sku: product.sku || "",
        unit: product.unit || "",
        grade: gradeText,
        size: sizeText,
        totalStock: 0,
        totalSold: 0,
        remaining: 0,
        stockEntries: [],
        sales: [],
      };
      groups.set(key, group);
    }
    return group;
  };

  // Stock that was on hand when the product was created (no grade / size).
  for (const move of openingMoves) {
    if (!move.product) continue;

    getGroup(move.product, "", "").stockEntries.push({
      id: String(move._id),
      kind: "opening",
      date: null,
      createdAt: move.createdAt,
      dateMode: "BS",
      grade: "",
      size: "",
      quantity: move.quantity,
      returnedQuantity: 0,
      netQuantity: move.quantity,
      rate: 0,
      total: 0,
      remarks: "Opening stock",
      supplierName: "",
      invoiceNumber: "",
      amountPaid: 0,
      dueAmount: 0,
    });
  }

  for (const purchase of purchases) {
    if (!purchase.product) continue;

    const returned = purchase.returnedQuantity || 0;

    getGroup(purchase.product, purchase.grade, purchase.size).stockEntries.push({
      id: String(purchase._id),
      kind: "purchase",
      date: purchase.date,
      createdAt: purchase.createdAt,
      dateMode: purchase.dateMode || "BS",
      grade: clean(purchase.grade),
      size: clean(purchase.size),
      quantity: purchase.quantity,
      returnedQuantity: returned,
      // Goods sent back to the supplier are no longer stock.
      netQuantity: round2(purchase.quantity - returned),
      rate: purchase.rate,
      total: purchase.total,
      remarks: purchase.remarks || "",
      supplierName: purchase.supplier?.name || "",
      invoiceNumber: purchase.invoiceNumber || "",
      amountPaid: purchase.amountPaid || 0,
      dueAmount: purchase.dueAmount || 0,
    });
  }

  // One sales row per invoice per variant (if the same variant sits on two
  // lines of one invoice, the quantities are added together).
  const saleRows = new Map();

  for (const invoice of invoices) {
    for (const item of invoice.items || []) {
      if (!item.product) continue;

      const group = getGroup(item.product, item.grade, item.size);
      const rowKey = `${group.key}::${String(invoice._id)}`;

      let row = saleRows.get(rowKey);
      if (!row) {
        row = {
          invoiceId: String(invoice._id),
          invoiceNumber: invoice.invoiceNumber,
          date: invoice.date,
          dateMode: invoice.dateMode || "BS",
          customerName: invoice.customer?.name || invoice.buyerName || "—",
          quantity: 0,
        };
        saleRows.set(rowKey, row);
        group.sales.push(row);
      }
      row.quantity = round2(row.quantity + item.quantity);
    }
  }

  const list = [...groups.values()];

  for (const group of list) {
    group.totalStock = round2(
      group.stockEntries.reduce((sum, entry) => sum + entry.netQuantity, 0),
    );
    group.totalSold = round2(
      group.sales.reduce((sum, row) => sum + row.quantity, 0),
    );
    group.remaining = round2(group.totalStock - group.totalSold);
  }

  list.sort(
    (a, b) =>
      compareText(a.productName, b.productName) ||
      compareText(a.grade, b.grade) ||
      compareText(a.size, b.size),
  );

  return {
    groups: list,
    totals: {
      variants: list.length,
      totalStock: round2(list.reduce((sum, g) => sum + g.totalStock, 0)),
      totalSold: round2(list.reduce((sum, g) => sum + g.totalSold, 0)),
      remaining: round2(list.reduce((sum, g) => sum + g.remaining, 0)),
    },
  };
};

const getStockSummary = async (req, res) => {
  try {
    // Plain .find() calls (not .aggregate()) so the companyScope plugin keeps
    // every query — including the populated ones — inside the logged-in company.
    const [purchases, invoices, openingMoves] = await Promise.all([
      Purchase.find()
        .populate("supplier", "name")
        .populate("product", "name sku unit")
        .sort({ date: 1, createdAt: 1 }),
      Invoice.find()
        .populate("customer", "name")
        .populate("items.product", "name sku unit")
        .sort({ date: 1, createdAt: 1 }),
      StockMovement.find({ type: "in", reason: OPENING_STOCK_REASON })
        .populate("product", "name sku unit")
        .sort({ createdAt: 1 }),
    ]);

    res.status(200).json({
      success: true,
      data: buildStockSummary({ purchases, invoices, openingMoves }),
    });
  } catch (error) {
    console.error("Get stock summary error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch stock summary" });
  }
};

module.exports = { getStockSummary, buildStockSummary };