const mongoose = require("mongoose");
const Client = require("../models/Client");
const Invoice = require("../models/Invoice");
const Purchase = require("../models/Purchase");
const { getCurrentCompanyId } = require("../utils/tenantContext");
const { round2 } = require("../utils/receiptAllocation");

const VALID_TYPES = ["customer", "supplier"];

const getClients = async (req, res) => {
  try {
    const { type } = req.query;
    const filter = {};

    if (type) {
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid type. Must be 'customer' or 'supplier'.",
        });
      }
      filter.type = type;
    }

    const clients = await Client.find(filter).sort({ name: 1 });

    res.status(200).json({ success: true, data: clients });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch clients" });
  }
};

const getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    }

    res.status(200).json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch client" });
  }
};

const createClient = async (req, res) => {
  try {
    const {
      name,
      type,
      customerCategory,
      country,
      city,
      address,
      email,
      phone,
      vatNumber,
      openingDue,
    } = req.body;

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Name is required" });
    }

    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be 'customer' or 'supplier'",
      });
    }

    const parsedOpeningDue = Number(openingDue);
    if (openingDue !== undefined && (!Number.isFinite(parsedOpeningDue) || parsedOpeningDue < 0)) {
      return res
        .status(400)
        .json({ success: false, message: "Opening due cannot be negative" });
    }

    const client = await Client.create({
      name: name.trim(),
      type,
      customerCategory:
        type === "customer" ? customerCategory || "normal" : undefined,
      country: type === "supplier" ? country : undefined,
      city,
      address,
      email,
      phone,
      vatNumber,
      openingDue: Number.isFinite(parsedOpeningDue) ? parsedOpeningDue : 0,
    });

    res.status(201).json({
      success: true,
      message: "Client created successfully",
      data: client,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A client with this value already exists",
      });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to create client" });
  }
};

const updateClient = async (req, res) => {
  try {
    const {
      name,
      type,
      customerCategory,
      country,
      city,
      address,
      email,
      phone,
      vatNumber,
      openingDue,
    } = req.body;

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be 'customer' or 'supplier'",
      });
    }

    const updates = {
      name,
      type,
      customerCategory:
        type === "customer" ? customerCategory || "normal" : undefined,
      country: type === "supplier" ? country : undefined,
      city,
      address,
      email,
      phone,
      vatNumber,
    };

    if (openingDue !== undefined) {
      const parsedOpeningDue = Number(openingDue);
      if (!Number.isFinite(parsedOpeningDue) || parsedOpeningDue < 0) {
        return res.status(400).json({
          success: false,
          message: "Opening due cannot be negative",
        });
      }
      updates.openingDue = parsedOpeningDue;
    }

    const client = await Client.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!client) {
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    }

    res.status(200).json({
      success: true,
      message: "Client updated successfully",
      data: client,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A client with this value already exists",
      });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to update client" });
  }
};

const deleteClient = async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);

    if (!client) {
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Client deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete client" });
  }
};

const VALID_CATEGORIES = ["distributor", "wholesaler", "retailer", "normal"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Escapes user-typed text before it goes into a RegExp, so characters like
// "(" or "." in an address don't blow up the query or match too broadly.
const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * All Clients Summary Report — one row per client with a running account
 * balance, plus a grand-total row summing every column.
 *
 * Supports three optional filters, all applied server-side:
 *   customerCategory -> only customers of this type (distributor/wholesaler/
 *                        retailer/normal). Ignored for suppliers, who don't
 *                        have this field.
 *   location          -> free-text, case-insensitive match against the
 *                        client's city, country or address.
 *   startDate/endDate -> "YYYY-MM-DD" (AD), inclusive. When given, the sales/
 *                        purchase/payment columns are limited to invoices or
 *                        purchases dated inside that range (monthly, yearly,
 *                        or any custom range the caller wants) instead of
 *                        being all-time totals.
 *
 * Customers (?type=customer, the default):
 *   Previous Due       -> customer.openingDue (balance carried in from before this system)
 *   VAT Sales          -> sum of invoice grandTotal for cash/bank invoices
 *   Credit Sales       -> sum of invoice grandTotal for credit invoices
 *   Total Sales        -> VAT Sales + Credit Sales
 *   Payments Received  -> sum of invoice amountReceived
 *   Due Amount         -> Previous Due + Total Sales - Payments Received
 *
 * Suppliers (?type=supplier):
 *   Previous Due       -> supplier.openingDue
 *   Total Purchases    -> sum of purchase total
 *   Payments Made      -> sum of purchase amountPaid
 *   Due Amount         -> Previous Due + Total Purchases - Payments Made
 *   (Purchases have no VAT/credit split in this system, so there's no
 *   equivalent of VAT Sales / Credit Sales for suppliers.)
 *
 * Note on Due Amount + a date range: "Previous Due" always stays the
 * client's opening balance (it isn't a period figure to begin with). But the
 * exact, no-filter Due Amount is built from each invoice/purchase's own
 * *current* remaining balance, which can shift later as receipts/payments
 * come in — that figure can't be sliced by date without also slicing every
 * payment that ever touched it. So whenever a date range is applied, Due
 * Amount is instead Previous Due + (Sales/Purchases - Payments) for just
 * that period — the right number for "how this period moved the account",
 * not a point-in-time balance.
 */
const getClientSummaryReport = async (req, res) => {
  try {
    const { type, customerCategory, location, startDate, endDate } = req.query;
    const clientType = type === "supplier" ? "supplier" : "customer";

    // .aggregate() bypasses the companyScope plugin (it only hooks .find()-style
    // queries), so — same as dashboardController — it needs an explicit $match,
    // and the companyId has to be cast to ObjectId by hand.
    const companyId = new mongoose.Types.ObjectId(getCurrentCompanyId());

    // ---- Client-level filters: which rows appear in the report at all ----
    const clientFilter = { type: clientType };

    let appliedCategory = "";
    if (clientType === "customer" && customerCategory) {
      const normalized = String(customerCategory).trim().toLowerCase();
      if (VALID_CATEGORIES.includes(normalized)) {
        clientFilter.customerCategory = normalized;
        appliedCategory = normalized;
      }
    }

    let appliedLocation = "";
    if (location && String(location).trim()) {
      appliedLocation = String(location).trim();
      const locationRegex = new RegExp(escapeRegex(appliedLocation), "i");
      clientFilter.$or = [
        { city: locationRegex },
        { country: locationRegex },
        { address: locationRegex },
      ];
    }

    // ---- Transaction-level filter: which invoices/purchases count ----
    let normalizedStart = startDate && ISO_DATE_RE.test(startDate) ? startDate : "";
    let normalizedEnd = endDate && ISO_DATE_RE.test(endDate) ? endDate : "";
    // Guard against a reversed range (e.g. "From" picked after "To"), which
    // would otherwise silently match nothing and look identical to a bug.
    if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
      [normalizedStart, normalizedEnd] = [normalizedEnd, normalizedStart];
    }
    const dateRange = {};
    if (normalizedStart) dateRange.$gte = normalizedStart;
    if (normalizedEnd) dateRange.$lte = normalizedEnd;
    const hasDateFilter = Object.keys(dateRange).length > 0;

    const clients = await Client.find(clientFilter).sort({ name: 1 });

    const appliedFilters = {
      customerCategory: appliedCategory,
      location: appliedLocation,
      startDate: dateRange.$gte || "",
      endDate: dateRange.$lte || "",
    };

    if (clientType === "customer") {
      const invoiceMatch = { company: companyId };
      if (hasDateFilter) invoiceMatch.date = dateRange;

      const salesAgg = await Invoice.aggregate([
        { $match: invoiceMatch },
        {
          $group: {
            _id: "$customer",
            vatSales: {
              $sum: {
                $cond: [
                  { $ne: ["$paymentMode", "credit"] },
                  "$grandTotal",
                  0,
                ],
              },
            },
            creditSales: {
              $sum: {
                $cond: [{ $eq: ["$paymentMode", "credit"] }, "$grandTotal", 0],
              },
            },
            totalSales: { $sum: "$grandTotal" },
            paymentsReceived: { $sum: "$amountReceived" },
            invoicedDue: { $sum: "$dueAmount" },
          },
        },
      ]);

      const aggByClient = new Map(
        salesAgg.map((row) => [String(row._id), row]),
      );
      const emptyAgg = {
        vatSales: 0,
        creditSales: 0,
        totalSales: 0,
        paymentsReceived: 0,
        invoicedDue: 0,
      };

      const rows = clients.map((client) => {
        const agg = aggByClient.get(String(client._id)) || emptyAgg;
        const previousDue = round2(client.openingDue || 0);
        // See the note above: exact running due when unfiltered, period net
        // change (sales minus payments) when a date range is applied.
        const dueAmount = hasDateFilter
          ? previousDue + agg.totalSales - agg.paymentsReceived
          : previousDue + agg.invoicedDue;

        return {
          _id: client._id,
          name: client.name,
          address: client.address || "",
          city: client.city || "",
          country: client.country || "",
          customerCategory: client.customerCategory || "normal",
          vatNumber: client.vatNumber || "",
          phone: client.phone || "",
          previousDue,
          vatSales: round2(agg.vatSales),
          creditSales: round2(agg.creditSales),
          totalSales: round2(agg.totalSales),
          paymentsReceived: round2(agg.paymentsReceived),
          dueAmount: round2(dueAmount),
        };
      });

      const grandTotal = rows.reduce(
        (totals, row) => ({
          previousDue: round2(totals.previousDue + row.previousDue),
          vatSales: round2(totals.vatSales + row.vatSales),
          creditSales: round2(totals.creditSales + row.creditSales),
          totalSales: round2(totals.totalSales + row.totalSales),
          paymentsReceived: round2(
            totals.paymentsReceived + row.paymentsReceived,
          ),
          dueAmount: round2(totals.dueAmount + row.dueAmount),
        }),
        {
          previousDue: 0,
          vatSales: 0,
          creditSales: 0,
          totalSales: 0,
          paymentsReceived: 0,
          dueAmount: 0,
        },
      );

      return res.status(200).json({
        success: true,
        data: { type: "customer", rows, grandTotal, filters: appliedFilters },
      });
    }

    // Suppliers — same idea, driven by Purchase instead of Invoice.
    const purchaseMatch = { company: companyId };
    if (hasDateFilter) purchaseMatch.date = dateRange;

    const purchaseAgg = await Purchase.aggregate([
      { $match: purchaseMatch },
      {
        $group: {
          _id: "$supplier",
          totalPurchases: { $sum: "$total" },
          paymentsMade: { $sum: "$amountPaid" },
          purchasedDue: { $sum: "$dueAmount" },
        },
      },
    ]);

    const aggByClient = new Map(
      purchaseAgg.map((row) => [String(row._id), row]),
    );
    const emptyAgg = { totalPurchases: 0, paymentsMade: 0, purchasedDue: 0 };

    const rows = clients.map((client) => {
      const agg = aggByClient.get(String(client._id)) || emptyAgg;
      const previousDue = round2(client.openingDue || 0);
      const dueAmount = hasDateFilter
        ? previousDue + agg.totalPurchases - agg.paymentsMade
        : previousDue + agg.purchasedDue;

      return {
        _id: client._id,
        name: client.name,
        address: client.address || "",
        city: client.city || "",
        country: client.country || "",
        vatNumber: client.vatNumber || "",
        phone: client.phone || "",
        previousDue,
        totalPurchases: round2(agg.totalPurchases),
        paymentsMade: round2(agg.paymentsMade),
        dueAmount: round2(dueAmount),
      };
    });

    const grandTotal = rows.reduce(
      (totals, row) => ({
        previousDue: round2(totals.previousDue + row.previousDue),
        totalPurchases: round2(totals.totalPurchases + row.totalPurchases),
        paymentsMade: round2(totals.paymentsMade + row.paymentsMade),
        dueAmount: round2(totals.dueAmount + row.dueAmount),
      }),
      { previousDue: 0, totalPurchases: 0, paymentsMade: 0, dueAmount: 0 },
    );

    res.status(200).json({
      success: true,
      data: { type: "supplier", rows, grandTotal, filters: appliedFilters },
    });
  } catch (error) {
    console.error("Get client summary report error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate the clients summary report",
    });
  }
};

module.exports = {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientSummaryReport,
};