import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchPayments, deletePayment } from "../services/paymentService";
import { deleteReceipt } from "../services/receiptService";
import { formatDateByMode } from "../utils/bsDate";
import { formatAmount } from "../utils/receipts";
import DateInput from "../components/DateInput";

const CATEGORY_LABELS = {
  distributor: "Distributor",
  wholesaler: "Wholesaler",
  retailer: "Retailer",
  normal: "Normal Customer",
};

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "received", label: "Received from Customer" },
  { value: "paid", label: "Paid to Supplier" },
];

const buildRows = (payments) => {
  const rows = [];
  const receiptRows = new Map();

  for (const payment of payments) {
    if (!payment.receipt) {
      rows.push({ kind: "payment", key: payment._id, payment });
      continue;
    }

    const invoiceNumber = payment.reference?.invoiceNumber || "—";
    const existing = receiptRows.get(payment.receipt._id);
    if (existing) {
      existing.invoiceNumbers.push(invoiceNumber);
      continue;
    }

    const row = {
      kind: "receipt",
      key: `receipt-${payment.receipt._id}`,
      receipt: payment.receipt,
      date: payment.date,
      dateMode: payment.dateMode,
      client: payment.client,
      method: payment.method,
      remarks: payment.remarks,
      invoiceNumbers: [invoiceNumber],
    };
    receiptRows.set(payment.receipt._id, row);
    rows.push(row);
  }

  return rows;
};

// One flat shape for both kinds of row, used for filtering, searching and
// totals. "received" = money in from a customer, "paid" = money out to a
// supplier (same rule the Type column already used).
const rowInfo = (row) => {
  if (row.kind === "receipt") {
    return {
      direction: "received",
      date: row.date,
      client: row.client,
      amount: row.receipt.amount,
      receiptNumber: row.receipt.receiptNumber || "",
      invoiceText: row.invoiceNumbers.join(", "),
      method: row.method,
      remarks: row.remarks,
    };
  }

  const payment = row.payment;
  return {
    direction: payment.referenceModel === "Purchase" ? "paid" : "received",
    date: payment.date,
    client: payment.client,
    amount: payment.amount,
    receiptNumber: "",
    invoiceText: payment.reference?.invoiceNumber || "",
    method: payment.method,
    remarks: payment.remarks,
  };
};

// Suppliers have no customer type, so the column is only filled for customers.
const customerTypeLabel = (client) =>
  client && client.type === "customer"
    ? CATEGORY_LABELS[client.customerCategory] || CATEGORY_LABELS.normal
    : "";

const searchText = (info) =>
  [
    info.client?.name,
    info.client?.phone,
    info.client?.email,
    info.client?.city,
    info.client?.country,
    info.client?.address,
    info.client?.vatNumber,
    customerTypeLabel(info.client),
    info.direction === "paid" ? "paid to supplier" : "received from customer",
    info.receiptNumber,
    info.invoiceText,
    info.method,
    info.remarks,
    info.amount,
  ]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join(" ")
    .toLowerCase();

const PaymentList = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---- Filters (applied instantly, in the browser) ----
  const [typeFilter, setTypeFilter] = useState("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [fromMode, setFromMode] = useState("BS");
  const [toDate, setToDate] = useState("");
  const [toMode, setToMode] = useState("BS");

  const navigate = useNavigate();

  const loadPayments = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchPayments();
      setPayments(result.data);
    } catch (err) {
      setError("Couldn't load payments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const handleDelete = async (payment) => {
    const confirmed = window.confirm(
      "Delete this payment? The invoice's due amount will be restored.",
    );
    if (!confirmed) return;

    try {
      await deletePayment(payment._id);
      setPayments((prev) => prev.filter((p) => p._id !== payment._id));
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to delete payment.");
    }
  };

  const handleDeleteReceipt = async (row) => {
    const confirmed = window.confirm(
      `Delete receipt ${row.receipt.receiptNumber}? The amount will be added back to the due amount of every invoice it paid.`,
    );
    if (!confirmed) return;

    try {
      await deleteReceipt(row.receipt._id);
      setPayments((prev) =>
        prev.filter((p) => p.receipt?._id !== row.receipt._id),
      );
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to delete receipt.");
    }
  };

  const allRows = useMemo(() => buildRows(payments), [payments]);

  const dateRangeInvalid = !!fromDate && !!toDate && fromDate > toDate;

  const rows = useMemo(() => {
    // Every word typed must appear somewhere in the row's details, so
    // "ram kathmandu" finds Ram's payments where Ram lives in Kathmandu.
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return allRows.filter((row) => {
      const info = rowInfo(row);

      if (typeFilter !== "all" && info.direction !== typeFilter) return false;

      if (customerTypeFilter) {
        const isCustomer = info.client?.type === "customer";
        if (!isCustomer) return false;
        const category = info.client.customerCategory || "normal";
        if (category !== customerTypeFilter) return false;
      }

      if (!dateRangeInvalid) {
        if (fromDate && (!info.date || info.date < fromDate)) return false;
        if (toDate && (!info.date || info.date > toDate)) return false;
      }

      if (terms.length > 0) {
        const haystack = searchText(info);
        if (!terms.every((term) => haystack.includes(term))) return false;
      }

      return true;
    });
  }, [
    allRows,
    typeFilter,
    customerTypeFilter,
    search,
    fromDate,
    toDate,
    dateRangeInvalid,
  ]);

  const totals = useMemo(() => {
    let received = 0;
    let paid = 0;
    for (const row of rows) {
      const info = rowInfo(row);
      if (info.direction === "paid") paid += Number(info.amount) || 0;
      else received += Number(info.amount) || 0;
    }
    return { received, paid };
  }, [rows]);

  const hasActiveFilters =
    typeFilter !== "all" ||
    !!customerTypeFilter ||
    !!search.trim() ||
    !!fromDate ||
    !!toDate;

  const clearFilters = () => {
    setTypeFilter("all");
    setCustomerTypeFilter("");
    setSearch("");
    setFromDate("");
    setToDate("");
    setFromMode("BS");
    setToMode("BS");
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hisab-Kitab</h1>
          <p className="page-subtitle">
            Payments made to suppliers and received from customers.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-outline"
            onClick={() => navigate("/dashboard/hisab-kitab/new")}
          >
            + Pay Supplier
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/dashboard/hisab-kitab/receive")}
          >
            + Receive Payment
          </button>
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && payments.length === 0 && (
        <p className="page-subtitle">No payments recorded yet.</p>
      )}

      {!loading && !error && payments.length > 0 && (
        <>
          {/* ------------------------------ Filters ------------------------------ */}
          <div className="report-filters">
            <div className="report-filters-row">
              <div className="filter-field" style={{ flex: "2 1 280px" }}>
                <label htmlFor="hkSearch">Search</label>
                <input
                  id="hkSearch"
                  type="text"
                  placeholder="Name, phone, email, city, address, VAT, receipt #, invoice #..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="filter-field" style={{ flex: "1 1 200px" }}>
                <label htmlFor="hkCustomerType">Type of Customer</label>
                <select
                  id="hkCustomerType"
                  value={customerTypeFilter}
                  onChange={(e) => setCustomerTypeFilter(e.target.value)}
                >
                  <option value="">All customer types</option>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="report-filters-row" style={{ marginTop: 16 }}>
              <div
                className="filter-field filter-field-period"
                style={{ flex: "1 1 260px" }}
              >
                <label>Statement</label>
                <div className="period-toggle">
                  {TYPE_FILTERS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={`period-toggle-btn${typeFilter === t.value ? " active" : ""}`}
                      onClick={() => setTypeFilter(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ flex: "2 1 440px" }}>
                <div className="date-range-row" style={{ marginTop: 0 }}>
                  <DateInput
                    id="hkFromDate"
                    label="From"
                    value={fromDate}
                    onChange={setFromDate}
                    mode={fromMode}
                    onModeChange={setFromMode}
                  />
                  <DateInput
                    id="hkToDate"
                    label="To"
                    value={toDate}
                    onChange={setToDate}
                    mode={toMode}
                    onModeChange={setToMode}
                  />
                </div>
                {dateRangeInvalid && (
                  <p
                    className="error-text"
                    style={{ margin: "8px 0 0", fontSize: 13 }}
                  >
                    "From" must be on or before "To" — date filter not applied.
                  </p>
                )}
              </div>

              {hasActiveFilters && (
                <div className="filter-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ------------------------------ Totals ------------------------------- */}
          <p className="page-subtitle" style={{ margin: "0 0 12px" }}>
            Showing <strong>{rows.length}</strong> of {allRows.length} entries
            {" · "}Received:{" "}
            <strong style={{ color: "#059669" }}>
              {formatAmount(totals.received)}
            </strong>
            {" · "}Paid:{" "}
            <strong style={{ color: "#c2410c" }}>
              {formatAmount(totals.paid)}
            </strong>
          </p>

          {rows.length === 0 && (
            <p className="page-subtitle">
              No payments match these filters.
            </p>
          )}
        </>
      )}

      {!loading && !error && payments.length > 0 && rows.length > 0 && (
        <div className="table-wrapper" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Client</th>
                <th className="nowrap">Receipt #</th>
                <th className="nowrap">Invoice #</th>
                <th className="num">Amount</th>
                <th>Type of Customer</th>
                <th>Method</th>
                <th>Remarks</th>
                <th className="table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.kind === "receipt") {
                  return (
                    <tr key={row.key}>
                      <td>{formatDateByMode(row.date, row.dateMode)}</td>
                      <td>
                        <span className="tag-in">Received from Customer</span>
                      </td>
                      <td>{row.client?.name || "—"}</td>
                      <td className="nowrap">{row.receipt.receiptNumber}</td>
                      <td>{row.invoiceNumbers.join(", ")}</td>
                      <td className="num">
                        {formatAmount(row.receipt.amount)}
                      </td>
                      <td>{customerTypeLabel(row.client) || "—"}</td>
                      <td style={{ textTransform: "capitalize" }}>
                        {row.method}
                      </td>
                      <td>{row.remarks || "—"}</td>
                      <td className="table-actions-col">
                        <div className="table-actions">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() =>
                              navigate(
                                `/dashboard/hisab-kitab/receipts/${row.receipt._id}`,
                              )
                            }
                          >
                            View
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() =>
                              navigate(
                                `/dashboard/hisab-kitab/receipts/${row.receipt._id}/edit`,
                              )
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-outline btn-sm btn-danger"
                            onClick={() => handleDeleteReceipt(row)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const payment = row.payment;
                return (
                  <tr key={row.key}>
                    <td>{formatDateByMode(payment.date, payment.dateMode)}</td>
                    <td>
                      <span
                        className={
                          payment.referenceModel === "Purchase"
                            ? "tag-out"
                            : "tag-in"
                        }
                      >
                        {payment.referenceModel === "Purchase"
                          ? "Paid to Supplier"
                          : "Received from Customer"}
                      </span>
                    </td>
                    <td>{payment.client?.name || "—"}</td>
                    <td>—</td>
                    <td>{payment.reference?.invoiceNumber || "—"}</td>
                    <td className="num">{formatAmount(payment.amount)}</td>
                    <td>{customerTypeLabel(payment.client) || "—"}</td>
                    <td style={{ textTransform: "capitalize" }}>
                      {payment.method}
                    </td>
                    <td>{payment.remarks || "—"}</td>
                    <td className="table-actions-col">
                      <div className="table-actions">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() =>
                            navigate(`/dashboard/hisab-kitab/${payment._id}`)
                          }
                        >
                          View
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() =>
                            navigate(
                              `/dashboard/hisab-kitab/${payment._id}/edit`,
                            )
                          }
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-outline btn-sm btn-danger"
                          onClick={() => handleDelete(payment)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PaymentList;