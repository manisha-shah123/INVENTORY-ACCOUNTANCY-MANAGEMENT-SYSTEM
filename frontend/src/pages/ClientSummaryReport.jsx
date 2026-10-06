import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchClientSummaryReport } from "../services/clientService";
import { formatAmount } from "../utils/receipts";
import { formatDateByMode, isoToSlashDisplay, todayAdIso } from "../utils/bsDate";
import DateInput from "../components/DateInput";

const LABELS = {
  customer: {
    title: "All Clients Summary Report",
    subtitle:
      "Previous due, VAT sales, credit sales and payments received for every customer.",
    listPath: "customers",
    listLabel: "Customers",
    dueLabel: "Due Amount (Rs)",
  },
  supplier: {
    title: "All Suppliers Summary Report",
    subtitle:
      "Previous due, total purchases and payments made for every supplier.",
    listPath: "suppliers",
    listLabel: "Suppliers",
    dueLabel: "Amount Payable (Rs)",
  },
};

const CATEGORY_OPTIONS = [
  { value: "distributor", label: "Distributor" },
  { value: "wholesaler", label: "Wholesaler" },
  { value: "retailer", label: "Retailer" },
  { value: "normal", label: "Normal Customer" },
];

// Small edit-distance check so a typo like "Distributer" (as opposed to the
// correct "Distributor") still resolves to the right filter instead of
// silently matching nothing and looking like the filter is broken.
const levenshtein = (a, b) => {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
};

const resolveCategoryValue = (text) => {
  const t = text.trim().toLowerCase();
  if (!t) return "";

  const exact = CATEGORY_OPTIONS.find(
    (o) =>
      o.value === t ||
      o.label.toLowerCase() === t ||
      o.label.toLowerCase().startsWith(t) ||
      t.startsWith(o.label.toLowerCase()),
  );
  if (exact) return exact.value;

  // Fuzzy fallback: allow a couple of typo'd characters (e.g. "distributer",
  // "wholesaller"), scaled to word length so short words stay strict.
  let best = null;
  let bestDistance = Infinity;
  for (const o of CATEGORY_OPTIONS) {
    const label = o.label.toLowerCase();
    const distance = Math.min(
      levenshtein(t, label),
      levenshtein(t, o.value),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = o;
    }
  }
  const tolerance = Math.max(2, Math.floor(best?.label.length / 5 || 0));
  return best && bestDistance <= tolerance ? best.value : "";
};

const pad = (n) => String(n).padStart(2, "0");

const currentMonthValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const currentYearValue = () => String(new Date().getFullYear());


const monthToRange = (monthValue) => {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) return null;
  const [y, m] = monthValue.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { startDate: `${monthValue}-01`, endDate: `${monthValue}-${pad(lastDay)}` };
};

const yearToRange = (yearValue) => {
  if (!/^\d{4}$/.test(yearValue)) return null;
  return { startDate: `${yearValue}-01-01`, endDate: `${yearValue}-12-31` };
};

const PERIOD_MODES = [
  { value: "all", label: "All Time" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom Range" },
];

const ClientSummaryReport = ({ type = "customer" }) => {
  const navigate = useNavigate();
  const { admin } = useAuth();
  const labels = LABELS[type];

  const [rows, setRows] = useState([]);
  const [grandTotal, setGrandTotal] = useState(null);
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---- Filter bar state ----
  const [categoryInput, setCategoryInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [periodMode, setPeriodMode] = useState("all");
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [yearValue, setYearValue] = useState(currentYearValue());
  const [fromDate, setFromDate] = useState("");
  const [fromMode, setFromMode] = useState("AD");
  const [toDate, setToDate] = useState("");
  const [toMode, setToMode] = useState("AD");

  const loadReport = async (filters = {}) => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchClientSummaryReport(type, filters);
      setRows(result.data.rows);
      setGrandTotal(result.data.grandTotal);
      setAppliedFilters(result.data.filters || null);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Couldn't load the ${labels.listLabel.toLowerCase()} summary report.`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    
    setCategoryInput("");
    setLocationInput("");
    setPeriodMode("all");
    setFromDate("");
    setToDate("");
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const buildFilters = () => {
    const filters = {
      location: locationInput.trim(),
    };
    if (type === "customer") {
      filters.customerCategory = resolveCategoryValue(categoryInput);
    }

    let range = null;
    if (periodMode === "monthly") range = monthToRange(monthValue);
    else if (periodMode === "yearly") range = yearToRange(yearValue);
    else if (periodMode === "custom" && fromDate && toDate) {
      range = { startDate: fromDate, endDate: toDate };
    }
    if (range) {
      filters.startDate = range.startDate;
      filters.endDate = range.endDate;
    }
    return filters;
  };

  const handleApply = (event) => {
    if (event) event.preventDefault();
    if (periodMode === "custom") {
      if (!fromDate || !toDate) {
        setError("Pick both a from and a to date for a custom range.");
        return;
      }
      if (fromDate > toDate) {
        setError('The "From" date must be before the "To" date.');
        return;
      }
    }
    loadReport(buildFilters());
  };

  const handleClear = () => {
    setCategoryInput("");
    setLocationInput("");
    setPeriodMode("all");
    setMonthValue(currentMonthValue());
    setYearValue(currentYearValue());
    setFromDate("");
    setToDate("");
    loadReport();
  };

  const hasActiveFilters =
    !!appliedFilters &&
    (appliedFilters.customerCategory ||
      appliedFilters.location ||
      appliedFilters.startDate);

  const periodSummaryText = () => {
    if (!appliedFilters || !appliedFilters.startDate) return "All time";
    const from = isoToSlashDisplay(appliedFilters.startDate);
    const to = isoToSlashDisplay(appliedFilters.endDate);
    return `${from} – ${to} (AD)`;
  };

  // True only when a date/period filter is active AND every matching client
  // had zero transactions in that window — i.e. the table would otherwise be
  // a wall of zero rows. Previous Due (carried-over balance) is deliberately
  // excluded from this check: it isn't a period figure, so a nonzero opening
  // balance shouldn't be mistaken for "activity happened here".
  const periodHasNoActivity = () => {
    if (!appliedFilters || !appliedFilters.startDate) return false;
    if (!grandTotal || rows.length === 0) return false;
    return type === "customer"
      ? grandTotal.totalSales === 0 && grandTotal.paymentsReceived === 0
      : grandTotal.totalPurchases === 0 && grandTotal.paymentsMade === 0;
  };

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">{labels.title}</h1>
          <p className="page-subtitle">{labels.subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-outline"
            onClick={() => navigate(`/dashboard/${labels.listPath}`)}
          >
            Back to {labels.listLabel}
          </button>
          <button className="btn btn-outline" onClick={() => window.print()}>
            Print Report
          </button>
        </div>
      </div>

      <form className="report-filters no-print" onSubmit={handleApply}>
        <div className="report-filters-row">
          {type === "customer" && (
            <div className="filter-field">
              <label htmlFor="categoryFilter">Customer Type</label>
              <input
                id="categoryFilter"
                type="text"
                list="customer-category-options"
                placeholder="Search: Distributor, Wholesaler, Retailer, Normal..."
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
              />
              <datalist id="customer-category-options">
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.label} />
                ))}
              </datalist>
            </div>
          )}

          <div className="filter-field">
            <label htmlFor="locationFilter">Location</label>
            <input
              id="locationFilter"
              type="text"
              placeholder="Search by city, country or address..."
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
            />
          </div>

          <div className="filter-field filter-field-period">
            <label>Report Period</label>
            <div className="period-toggle">
              {PERIOD_MODES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`period-toggle-btn${periodMode === p.value ? " active" : ""}`}
                  onClick={() => setPeriodMode(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {periodMode === "monthly" && (
              <input
                type="month"
                value={monthValue}
                max={currentMonthValue()}
                onChange={(e) => setMonthValue(e.target.value)}
                style={{ marginTop: 8, maxWidth: 200 }}
              />
            )}

            {periodMode === "yearly" && (
              <input
                type="number"
                value={yearValue}
                min="2000"
                max={currentYearValue()}
                onChange={(e) => setYearValue(e.target.value)}
                style={{ marginTop: 8, maxWidth: 140 }}
              />
            )}

            {periodMode === "custom" && (
              <div className="date-range-row">
                <DateInput
                  id="fromDate"
                  label="From"
                  value={fromDate}
                  onChange={setFromDate}
                  mode={fromMode}
                  onModeChange={setFromMode}
                />
                <DateInput
                  id="toDate"
                  label="To"
                  value={toDate}
                  onChange={setToDate}
                  mode={toMode}
                  onModeChange={setToMode}
                />
              </div>
            )}
          </div>

          <div className="filter-actions">
            <button className="btn btn-primary btn-sm" type="submit">
              Apply Filters
            </button>
            <button
              className="btn btn-outline btn-sm"
              type="button"
              onClick={handleClear}
            >
              Clear
            </button>
          </div>
        </div>
      </form>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div
          className="bill-print-area statement-area"
          style={{ maxWidth: "100%" }}
        >
          <div className="bill-header">
            <h2 className="bill-company-name">
              {admin?.companyName || "Inventory MS"}
            </h2>
            <p className="bill-doc-title">{labels.title}</p>
          </div>

          <div className="bill-meta-grid">
            <div>
              <p>
                <strong>Report date:</strong>{" "}
                {formatDateByMode(todayAdIso(), "BS")}
              </p>
              <p>
                <strong>Report period:</strong> {periodSummaryText()}
              </p>
            </div>
            <div>
              <p>
                <strong>Total {labels.listLabel.toLowerCase()}:</strong>{" "}
                {rows.length}
              </p>
              {hasActiveFilters && (
                <p>
                  <strong>Filtered by:</strong>{" "}
                  {[
                    appliedFilters.customerCategory &&
                      CATEGORY_OPTIONS.find(
                        (c) => c.value === appliedFilters.customerCategory,
                      )?.label,
                    appliedFilters.location &&
                      `Location: "${appliedFilters.location}"`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="page-subtitle">
              No {labels.listLabel.toLowerCase()} match these filters.
            </p>
          ) : periodHasNoActivity() ? (
            <p className="page-subtitle">
              No {type === "customer" ? "sales" : "purchases"} were recorded
              for this period.
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client Name</th>
                    <th>Address</th>
                    <th>VAT Number</th>
                    <th>Phone</th>
                    <th className="num">Previous Due (Rs)</th>
                    {type === "customer" ? (
                      <>
                        <th className="num">VAT Sales (Rs)</th>
                        <th className="num">Credit Sales (Rs)</th>
                        <th className="num">Total Sales (Rs)</th>
                        <th className="num">Payments Received (Rs)</th>
                      </>
                    ) : (
                      <>
                        <th className="num">Total Purchases (Rs)</th>
                        <th className="num">Payments Made (Rs)</th>
                      </>
                    )}
                    <th className="num">{labels.dueLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row._id}>
                      <td>{row.name}</td>
                      <td>{row.address || "—"}</td>
                      <td>{row.vatNumber || "—"}</td>
                      <td>{row.phone || "—"}</td>
                      <td className="num">{formatAmount(row.previousDue)}</td>
                      {type === "customer" ? (
                        <>
                          <td className="num">
                            {formatAmount(row.vatSales)}
                          </td>
                          <td className="num">
                            {formatAmount(row.creditSales)}
                          </td>
                          <td className="num">
                            {formatAmount(row.totalSales)}
                          </td>
                          <td className="num">
                            {formatAmount(row.paymentsReceived)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="num">
                            {formatAmount(row.totalPurchases)}
                          </td>
                          <td className="num">
                            {formatAmount(row.paymentsMade)}
                          </td>
                        </>
                      )}
                      <td
                        className="num"
                        style={{
                          color: row.dueAmount > 0 ? "#dc2626" : "inherit",
                          fontWeight: 600,
                        }}
                      >
                        {formatAmount(row.dueAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {grandTotal && (
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="tfoot-label">
                        Grand Total
                      </td>
                      <td className="num">
                        {formatAmount(grandTotal.previousDue)}
                      </td>
                      {type === "customer" ? (
                        <>
                          <td className="num">
                            {formatAmount(grandTotal.vatSales)}
                          </td>
                          <td className="num">
                            {formatAmount(grandTotal.creditSales)}
                          </td>
                          <td className="num">
                            {formatAmount(grandTotal.totalSales)}
                          </td>
                          <td className="num">
                            {formatAmount(grandTotal.paymentsReceived)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="num">
                            {formatAmount(grandTotal.totalPurchases)}
                          </td>
                          <td className="num">
                            {formatAmount(grandTotal.paymentsMade)}
                          </td>
                        </>
                      )}
                      <td className="num">
                        {formatAmount(grandTotal.dueAmount)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientSummaryReport;
