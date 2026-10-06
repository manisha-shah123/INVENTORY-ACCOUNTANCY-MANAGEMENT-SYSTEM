"use strict";


const NEPAL_OFFSET_MINUTES = 5 * 60 + 45;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FAR_FUTURE = "9999-12-31";


const ENTRY_TYPES = {
  capital_in: {
    label: "Owner put money in",
    direction: "in",
    help: "Money the owner invested in the business. Increases cash/bank and capital.",
  },
  drawings: {
    label: "Owner took money out",
    direction: "out",
    help: "Money the owner withdrew for personal use. Decreases cash/bank and capital.",
  },
  loan_in: {
    label: "Loan received",
    direction: "in",
    help: "A loan you received. Increases cash/bank and loans.",
  },
  loan_out: {
    label: "Loan repaid",
    direction: "out",
    help: "A loan instalment you paid back. Decreases cash/bank and loans.",
  },
  asset_buy: {
    label: "Fixed asset bought",
    direction: "out",
    help: "Machinery, vehicle, furniture, computer, etc. Decreases cash/bank and increases fixed assets.",
  },
  depreciation: {
    label: "Depreciation of fixed assets",
    direction: null,
    help: "Yearly wear-and-tear on fixed assets. No money moves; it lowers fixed assets and profit.",
  },
  vat_paid: {
    label: "VAT paid to government",
    direction: "out",
    help: "VAT you paid to the tax office. Decreases cash/bank and VAT payable.",
  },
  old_due_in: {
    label: "Old customer due received",
    direction: "in",
    help: "A customer paid a due from BEFORE you started using this system. Increases cash/bank and lowers receivable.",
  },
  old_due_out: {
    label: "Old supplier due paid",
    direction: "out",
    help: "You paid a supplier due from BEFORE you started using this system. Decreases cash/bank and lowers payable.",
  },
};


/* Small helpers */


const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Round to 2 decimals. The trailing "+ 0" turns -0 into 0.
const round2 = (value) =>
  Math.round((num(value) + Number.EPSILON) * 100) / 100 + 0;

// True only for a real calendar date written as YYYY-MM-DD.
const isValidIsoDate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

// Adds (or subtracts) whole days to a YYYY-MM-DD string. Done in UTC so it can
// never be thrown off by the server's time zone or daylight saving.
const addDays = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// The calendar date, in Nepal time, of a saved timestamp. (Stock adjustments
// only carry a timestamp, and just after midnight Nepal time the UTC date is
// still "yesterday".)
const nepalDate = (timestamp) => {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time + NEPAL_OFFSET_MINUTES * 60000)
    .toISOString()
    .slice(0, 10);
};

// Record dates are stored as AD "YYYY-MM-DD" strings. Anything that isn't a
// usable date returns null so the caller can skip (and count) the record.
const cleanDate = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isValidIsoDate(trimmed) ? trimmed : null;
};

const cleanMethod = (value) => (value === "bank" ? "bank" : "cash");

// Splits a signed balance into a "positive" and a "negative" part. Used so a
// balance that flips sign (e.g. a supplier overpaid) moves to the other side of
// the sheet instead of showing as a negative liability.
const splitSigned = (value) => ({
  pos: value > 0 ? value : 0,
  neg: value < 0 ? -value : 0,
});

const sumKeys = (obj, keys) =>
  keys.reduce((total, key) => total + num(obj[key]), 0);

const ASSET_KEYS = [
  "cash",
  "bank",
  "accountsReceivable",
  "inventory",
  "otherCurrentAssets",
  "fixedAssets",
];
const LIABILITY_KEYS = [
  "accountsPayable",
  "vatPayable",
  "loans",
  "otherCurrentLiabilities",
];
const EQUITY_KEYS = ["capital", "retainedEarnings", "currentYearProfit"];

// Money an entry moves in or out of cash/bank (signed). 0 = no money moves.
const entryMoney = (type, amount) => {
  const config = ENTRY_TYPES[type];
  if (!config || !config.direction) return 0;
  return config.direction === "in" ? amount : -amount;
};


const classifyMovement = (movement, returnsByProduct) => {
  if (movement.source) return movement.source;

  const reason = String(movement.reason || "").trim();

  if (movement.type === "in" && reason === "Opening stock") return "opening";
  if (/^Invoice #/i.test(reason)) return "sale";
  if (/^Purchase from /i.test(reason) || /^Purchase deleted/i.test(reason)) {
    return "purchase";
  }
  if (/^Purchase return to /i.test(reason)) return "purchase_return";

  if (movement.type === "out") {
    const returns = returnsByProduct.get(String(movement.product)) || [];
    const time = new Date(movement.createdAt).getTime();
    const quantity = num(movement.quantity);
    if (
      returns.some(
        (r) => r.quantity === quantity && Math.abs(r.time - time) <= 10000,
      )
    ) {
      return "purchase_return";
    }
  }

  return "adjustment";
};


const prepare = (data = {}) => {
  const {
    products = [],
    clients = [],
    invoices = [],
    purchases = [],
    purchaseReturns = [],
    payments = [],
    expenses = [],
    movements = [],
    entries = [],
    opening = null,
  } = data;

  let skipped = 0; // records left out because their date is unusable

  /* ---- opening balances the user typed ---- */
  const openingValues = {
    cash: Math.max(0, num(opening && opening.cash)),
    bank: Math.max(0, num(opening && opening.bank)),
    fixedAssets: Math.max(0, num(opening && opening.fixedAssets)),
    loans: Math.max(0, num(opening && opening.loans)),
  };

  /* ---- products ---- */
  const productMap = new Map();
  for (const p of products) {
    productMap.set(String(p._id), {
      id: String(p._id),
      price: Math.max(0, num(p.purchasePrice)),
      currentStock: num(p.currentStock),
      openQty: 0,
    });
  }

  /* ---- previous dues (customers / suppliers) ---- */
  let ar0 = 0;
  let ap0 = 0;
  for (const c of clients) {
    const due = Math.max(0, num(c.openingDue));
    if (c.type === "customer") ar0 += due;
    else if (c.type === "supplier") ap0 += due;
  }

  /* ---- stock movements: opening stock and manual adjustments ---- */
  const returnsByProduct = new Map();
  for (const r of purchaseReturns) {
    const key = String(r.product);
    if (!returnsByProduct.has(key)) returnsByProduct.set(key, []);
    returnsByProduct.get(key).push({
      quantity: num(r.quantity),
      time: new Date(r.createdAt).getTime(),
    });
  }

  const adjustments = [];
  for (const m of movements) {
    const product = productMap.get(String(m.product));
    if (!product) continue; // product was deleted

    const kind = classifyMovement(m, returnsByProduct);
    const quantity = num(m.quantity);

    if (kind === "opening") {
      product.openQty += quantity;
    } else if (kind === "adjustment") {
      const date = nepalDate(m.createdAt);
      if (!date) {
        skipped += 1;
        continue;
      }
      adjustments.push({
        product: product.id,
        date,
        delta: m.type === "in" ? quantity : -quantity,
      });
    }
  }

  let inv0 = 0; // opening stock value
  for (const product of productMap.values()) {
    inv0 += product.openQty * product.price;
  }
 const paidViaInvoice = new Map();
  const paidViaPurchase = new Map();
  const customerPayments = [];
  const supplierPayments = [];

  for (const pay of payments) {
    const amount = num(pay.amount);
    if (amount <= 0) continue;

    const key = String(pay.reference);
    const isPurchase = pay.referenceModel === "Purchase";
    const tally = isPurchase ? paidViaPurchase : paidViaInvoice;
    tally.set(key, (tally.get(key) || 0) + amount);

    const date = cleanDate(pay.date);
    if (!date) {
      skipped += 1;
      continue;
    }
    (isPurchase ? supplierPayments : customerPayments).push({
      date,
      amount,
      method: cleanMethod(pay.method),
    });
  }

  /* ---- invoices ---- */
  const invoiceList = [];
  for (const inv of invoices) {
    const date = cleanDate(inv.date);
    if (!date) {
      skipped += 1;
      continue;
    }

    const grand = num(inv.grandTotal);
    const vat = num(inv.vatAmount);
    const taxable =
      inv.taxableAmount === undefined || inv.taxableAmount === null
        ? grand - vat
        : num(inv.taxableAmount);

  const viaPayments = paidViaInvoice.get(String(inv._id)) || 0;
    const atSale = Math.max(0, round2(num(inv.amountReceived) - viaPayments));

    invoiceList.push({
      date,
      grand,
      vat,
      taxable,
      atSale,
    atSaleMethod: inv.paymentMode === "bank" ? "bank" : "cash",
      items: (inv.items || []).map((item) => ({
        product: String(item.product),
        qty: num(item.quantity),
      })),
    });
  }

  /* ---- purchases (and their returns) ---- */
  const returnsByPurchase = new Map();
  for (const r of purchaseReturns) {
    const date = cleanDate(r.date);
    if (!date) {
      skipped += 1;
      continue;
    }
    const key = String(r.purchase);
    if (!returnsByPurchase.has(key)) returnsByPurchase.set(key, []);
    returnsByPurchase.get(key).push({ date, qty: num(r.quantity) });
  }

  const purchaseList = [];
  for (const p of purchases) {
    const date = cleanDate(p.date);
    if (!date) {
      skipped += 1;
      continue;
    }

    const id = String(p._id);
    const returns = [...(returnsByPurchase.get(id) || [])];

    const recordedQty = returns.reduce((t, r) => t + r.qty, 0);
    const legacyQty = Math.max(0, num(p.returnedQuantity) - recordedQty);
    if (legacyQty > 0) returns.push({ date, qty: legacyQty });

    const viaPayments = paidViaPurchase.get(id) || 0;

    purchaseList.push({
      date,
      product: String(p.product),
      qty: num(p.quantity),
      rate: num(p.rate),
      paidAtPurchase: Math.max(0, round2(num(p.amountPaid) - viaPayments)),
      method: cleanMethod(p.paymentMethod),
      returns,
    });
  }

  /* ---- expenses ---- */
  const expenseList = [];
  for (const e of expenses) {
    const date = cleanDate(e.date);
    if (!date) {
      skipped += 1;
      continue;
    }
    const amount = num(e.amount);
    if (amount <= 0) continue;
    expenseList.push({ date, amount, method: cleanMethod(e.paymentMethod) });
  }

  /* ---- other entries ---- */
  const entryList = [];
  for (const e of entries) {
    if (!ENTRY_TYPES[e.type]) continue;
    const date = cleanDate(e.date);
    if (!date) {
      skipped += 1;
      continue;
    }
    const amount = round2(num(e.amount));
    if (amount <= 0) continue;
    entryList.push({
      date,
      type: e.type,
      amount,
      method: cleanMethod(e.method),
    });
  }

  /* ---- opening capital: what the owner had put in at the start ---- */
  const openingCapital =
    openingValues.cash +
    openingValues.bank +
    openingValues.fixedAssets +
    ar0 +
    inv0 -
    ap0 -
    openingValues.loans;

  return {
    opening: openingValues,
    openingSet: Boolean(opening),
    products: productMap,
    ar0,
    ap0,
    inv0,
    openingCapital,
    adjustments,
    customerPayments,
    supplierPayments,
    invoices: invoiceList,
    purchases: purchaseList,
    expenses: expenseList,
    entries: entryList,
    skipped,
  };
};



const snapshot = (ctx, asOf) => {
  let cash = ctx.opening.cash;
  let bank = ctx.opening.bank;
  const move = (method, amount) => {
    if (method === "bank") bank += amount;
    else cash += amount;
  };

  /* ---- sales and customer money ---- */
  let salesTaxable = 0; // sales excluding VAT
  let vatCollected = 0;
  let arSigned = ctx.ar0;
  const soldQty = new Map();

  for (const inv of ctx.invoices) {
    if (inv.date > asOf) continue;
    salesTaxable += inv.taxable;
    vatCollected += inv.vat;
    arSigned += inv.grand - inv.atSale;
    move(inv.atSaleMethod, inv.atSale);
    for (const item of inv.items) {
      soldQty.set(item.product, (soldQty.get(item.product) || 0) + item.qty);
    }
  }
  for (const pay of ctx.customerPayments) {
    if (pay.date > asOf) continue;
    arSigned -= pay.amount;
    move(pay.method, pay.amount);
  }

  /* ---- purchases and supplier money ---- */
  let purchasesNet = 0; // purchases after returns, at purchase cost
  let apSigned = ctx.ap0;
  const boughtQty = new Map();
  const boughtValue = new Map();

  for (const p of ctx.purchases) {
    if (p.date > asOf) continue;

    const returnedQty = p.returns.reduce(
      (total, r) => (r.date <= asOf ? total + r.qty : total),
      0,
    );
    const netQty = p.qty - returnedQty;
    const netValue = p.rate * netQty;

    purchasesNet += netValue;
    apSigned += netValue - p.paidAtPurchase;
    move(p.method, -p.paidAtPurchase);

    boughtQty.set(p.product, (boughtQty.get(p.product) || 0) + netQty);
    boughtValue.set(p.product, (boughtValue.get(p.product) || 0) + netValue);
  }
  for (const pay of ctx.supplierPayments) {
    if (pay.date > asOf) continue;
    apSigned -= pay.amount;
    move(pay.method, -pay.amount);
  }

  /* ---- expenses ---- */
  let expensesTotal = 0;
  for (const e of ctx.expenses) {
    if (e.date > asOf) continue;
    expensesTotal += e.amount;
    move(e.method, -e.amount);
  }

  /* ---- other entries ---- */
  let capitalMovement = 0;
  let loansSigned = ctx.opening.loans;
  let fixedAssets = ctx.opening.fixedAssets;
  let vatPaid = 0;
  let depreciation = 0;

  for (const e of ctx.entries) {
    if (e.date > asOf) continue;

    const money = entryMoney(e.type, e.amount);
    if (money !== 0) move(e.method, money);

    switch (e.type) {
      case "capital_in":
        capitalMovement += e.amount;
        break;
      case "drawings":
        capitalMovement -= e.amount;
        break;
      case "loan_in":
        loansSigned += e.amount;
        break;
      case "loan_out":
        loansSigned -= e.amount;
        break;
      case "asset_buy":
        fixedAssets += e.amount;
        break;
      case "depreciation":
        fixedAssets -= e.amount;
        depreciation += e.amount;
        break;
      case "vat_paid":
        vatPaid += e.amount;
        break;
      case "old_due_in":
        arSigned -= e.amount;
        break;
      case "old_due_out":
        apSigned -= e.amount;
        break;
      default:
        break;
    }
  }

  /* ---- manual stock adjustments ---- */
  const adjustedQty = new Map();
  for (const a of ctx.adjustments) {
    if (a.date > asOf) continue;
    adjustedQty.set(a.product, (adjustedQty.get(a.product) || 0) + a.delta);
  }

 let inventory = 0;
  const qtyByProduct = new Map();

  for (const product of ctx.products.values()) {
    const purchasedQty = boughtQty.get(product.id) || 0;
    const purchasedValue = boughtValue.get(product.id) || 0;

    const basisQty = product.openQty + purchasedQty;
    const basisValue = product.openQty * product.price + purchasedValue;
    const averageCost = basisQty > 0 ? basisValue / basisQty : product.price;

    const qty =
      basisQty -
      (soldQty.get(product.id) || 0) +
      (adjustedQty.get(product.id) || 0);

    qtyByProduct.set(product.id, qty);
    inventory += Math.max(0, qty) * averageCost;
  }

  /* ---- profit since the very beginning ---- */
  const costOfGoodsSold = ctx.inv0 + purchasesNet - inventory;
  const profit = salesTaxable - costOfGoodsSold - expensesTotal - depreciation;

  return {
    cash,
    bank,
    arSigned,
    apSigned,
    vatSigned: vatCollected - vatPaid,
    loansSigned,
    fixedAssets,
    inventory,
    capital: ctx.openingCapital + capitalMovement,
    profit,
    qtyByProduct,
  };
};


/**
 * @param asOf     the balance sheet date (YYYY-MM-DD, inclusive)
 * @param fyStart  first day of the fiscal year that `asOf` falls in. Profit
 *                 before this day is "Retained Earnings"; profit from this
 *                 day on is "Current Year Profit".
 */
const buildColumn = (ctx, asOf, fyStart) => {
  const now = snapshot(ctx, asOf);
  const before = snapshot(ctx, addDays(fyStart, -1));

  const receivable = splitSigned(now.arSigned);
  const payable = splitSigned(now.apSigned);
  const vat = splitSigned(now.vatSigned);
  const loans = splitSigned(now.loansSigned);

  const raw = {
    cash: now.cash,
    bank: now.bank,
    accountsReceivable: receivable.pos,
    inventory: now.inventory,
    // Money owed TO the business that isn't a customer sale: a supplier that
    // was overpaid, VAT that was overpaid, a loan repaid beyond its balance.
    otherCurrentAssets: payable.neg + vat.neg + loans.neg,
    fixedAssets: now.fixedAssets,

    accountsPayable: payable.pos,
    vatPayable: vat.pos,
    loans: loans.pos,
    // Customers who paid more than they owed.
    otherCurrentLiabilities: receivable.neg,

    capital: now.capital,
    retainedEarnings: before.profit,
    currentYearProfit: now.profit - before.profit,
  };

  const rawDifference =
    sumKeys(raw, ASSET_KEYS) -
    sumKeys(raw, LIABILITY_KEYS) -
    sumKeys(raw, EQUITY_KEYS);

  const balances = {};
  for (const key of [...ASSET_KEYS, ...LIABILITY_KEYS, ...EQUITY_KEYS]) {
    balances[key] = round2(raw[key]);
  }

  const totalsOf = (b) => {
    const totalAssets = round2(sumKeys(b, ASSET_KEYS));
    const totalLiabilities = round2(sumKeys(b, LIABILITY_KEYS));
    const totalEquity = round2(sumKeys(b, EQUITY_KEYS));
    return {
      totalAssets,
      totalLiabilities,
      totalEquity,
      liabilitiesAndEquity: round2(totalLiabilities + totalEquity),
      difference: round2(totalAssets - totalLiabilities - totalEquity),
    };
  };

  let totals = totalsOf(balances);

  if (Math.abs(rawDifference) < 0.01 && totals.difference !== 0) {
    balances.capital = round2(balances.capital + totals.difference);
    totals = totalsOf(balances);
  }

  const isBalanced = Math.abs(totals.difference) < 0.01;

  const warnings = [];
  if (balances.cash < 0) {
    warnings.push(
      "Cash in Hand is negative. Check your opening cash, and record any money the owner put in or loans received under Other Entries.",
    );
  }
  if (balances.bank < 0) {
    warnings.push(
      "Bank Balance is negative. Check your opening bank balance, and record any money the owner put in or loans received under Other Entries.",
    );
  }
  if (balances.fixedAssets < 0) {
    warnings.push(
      "Fixed Assets is negative. Depreciation entered is more than the assets recorded.",
    );
  }
  if (!isBalanced) {
    warnings.push(
      "Assets do not equal Liabilities + Equity. Some records disagree with each other (for example a payment that points at a deleted purchase or invoice).",
    );
  }

  return { asOf, fyStart, balances, totals, isBalanced, warnings };
};


/**
 * @param data  { products, clients, invoices, purchases, purchaseReturns,
 *                payments, expenses, movements, entries, opening }
 * @param query { asOf, fyStart, prevAsOf?, prevFyStart? }  (YYYY-MM-DD)
 */
const computeBalanceSheet = (data, query) => {
  const ctx = prepare(data);

  const current = buildColumn(ctx, query.asOf, query.fyStart);
  const previous =
    query.prevAsOf && query.prevFyStart
      ? buildColumn(ctx, query.prevAsOf, query.prevFyStart)
      : null;

  const warnings = [];
  if (ctx.skipped > 0) {
    warnings.push(
      `${ctx.skipped} record${ctx.skipped === 1 ? " has" : "s have"} an unreadable date and ${ctx.skipped === 1 ? "was" : "were"} left out of these figures.`,
    );
  }

  // Compare the stock worked out from purchase/sales history with the stock
  // the products actually show.
  const latest = snapshot(ctx, FAR_FUTURE);
  let mismatches = 0;
  for (const product of ctx.products.values()) {
    const expected = latest.qtyByProduct.get(product.id) || 0;
    if (Math.abs(expected - product.currentStock) > 0.0001) mismatches += 1;
  }
  if (mismatches > 0) {
    warnings.push(
      `Stock quantities for ${mismatches} product${mismatches === 1 ? "" : "s"} don't match their purchase and sales history, so the inventory value may be slightly off.`,
    );
  }

  return {
    openingSet: ctx.openingSet,
    current,
    previous,
    warnings,
  };
};


const computeOpeningPosition = (data) => {
  const ctx = prepare(data);
  return {
    accountsReceivable: round2(ctx.ar0),
    accountsPayable: round2(ctx.ap0),
    inventory: round2(ctx.inv0),
    capital: round2(ctx.openingCapital),
  };
};

module.exports = {
  ENTRY_TYPES,
  ASSET_KEYS,
  LIABILITY_KEYS,
  EQUITY_KEYS,
  round2,
  isValidIsoDate,
  addDays,
  nepalDate,
  classifyMovement,
  computeBalanceSheet,
  computeOpeningPosition,
};
