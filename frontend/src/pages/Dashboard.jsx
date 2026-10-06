import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDashboardSummary } from "../services/dashboardService";
import DateInput from "../components/DateInput";
import {
  BS_MONTHS,
  adToBsSafe,
  bsToAdSafe,
  formatDateByMode,
  getDaysInBsMonth,
  todayAdIso,
} from "../utils/bsDate";

// `count` / `noun` (optional) show e.g. "12 invoices" under the amount.
// `filtered: true` marks the cards the period filter applies to.
const CARD_CONFIG = [
  { key: "stockValue", label: "Stock Value" },
  {
    key: "totalSales",
    label: "Total Sales",
    filtered: true,
    countKey: "salesCount",
    noun: ["invoice", "invoices"],
  },
  {
    key: "totalPurchase",
    label: "Total Purchase",
    filtered: true,
    countKey: "purchaseCount",
    noun: ["purchase", "purchases"],
  },
  { key: "receivable", label: "Receivable" },
  { key: "payable", label: "Payable" },
  { key: "totalExpense", label: "Expenses" },
];

const QUICK_ACTIONS = [
  { label: "Add Customer", to: "/dashboard/customers/new", icon: "👤" },
  { label: "Add Supplier", to: "/dashboard/suppliers/new", icon: "🚚" },
  { label: "Add Product", to: "/dashboard/products/new", icon: "📦" },
  { label: "Create Invoice", to: "/dashboard/sales/new", icon: "🧾" },
  { label: "Receive Payment", to: "/dashboard/hisab-kitab/receive", icon: "💰" },
];

const PERIOD_MODES = [
  { value: "all", label: "All Time" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "range", label: "Date Range" },
];

const AD_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// How many years back the Year dropdown goes (including the current year).
const YEAR_OPTIONS_COUNT = 11;

const formatMoney = (value) =>
  new Intl.NumberFormat("en-NP", {
    style: "currency",
    currency: "NPR",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

const pad = (n) => String(n).padStart(2, "0");

/* -------------------------------------------------------------------------- */
/* Period helpers                                                             */
/* Everything is turned into an inclusive AD { startDate, endDate } because   */
/* that is how invoices / purchases store their date ("YYYY-MM-DD", AD).      */
/* -------------------------------------------------------------------------- */

// Today's { year, month } in the given calendar ("BS" | "AD"), or null if the
// BS conversion isn't available.
const getTodayParts = (calendar) => {
  const adIso = todayAdIso();
  const iso = calendar === "BS" ? adToBsSafe(adIso) : adIso;
  if (!iso) return null;
  const [year, month] = iso.split("-").map(Number);
  return { year, month };
};

const monthToRange = (calendar, year, month) => {
  if (calendar === "AD") {
    const lastDay = new Date(year, month, 0).getDate();
    return {
      startDate: `${year}-${pad(month)}-01`,
      endDate: `${year}-${pad(month)}-${pad(lastDay)}`,
    };
  }
  const startDate = bsToAdSafe(`${year}-${pad(month)}-01`);
  const endDate = bsToAdSafe(
    `${year}-${pad(month)}-${pad(getDaysInBsMonth(year, month))}`,
  );
  return startDate && endDate ? { startDate, endDate } : null;
};

const yearToRange = (calendar, year) => {
  if (calendar === "AD") {
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }
  const startDate = bsToAdSafe(`${year}-01-01`);
  const endDate = bsToAdSafe(`${year}-12-${pad(getDaysInBsMonth(year, 12))}`);
  return startDate && endDate ? { startDate, endDate } : null;
};

const Dashboard = () => {
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [appliedLabel, setAppliedLabel] = useState("All time");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---- Period filter state ----
  // Monthly / Yearly can be picked in Nepali (BS) or English (AD) calendar.
  // BS is the default because that is what the rest of the app defaults to.
  const [periodMode, setPeriodMode] = useState("all");
  const [calendar, setCalendar] = useState(() =>
    getTodayParts("BS") ? "BS" : "AD",
  );
  const [year, setYear] = useState(
    () => (getTodayParts("BS") || getTodayParts("AD")).year,
  );
  const [month, setMonth] = useState(
    () => (getTodayParts("BS") || getTodayParts("AD")).month,
  );
  const [fromDate, setFromDate] = useState("");
  const [fromMode, setFromMode] = useState("BS");
  const [toDate, setToDate] = useState("");
  const [toMode, setToMode] = useState("BS");

  // Only the latest request is allowed to update the screen, so quickly
  // switching filters can never show an older answer on top of a newer one.
  const requestIdRef = useRef(0);

  const monthNames = calendar === "BS" ? BS_MONTHS : AD_MONTHS;

  const yearOptions = useMemo(() => {
    const currentYear = getTodayParts(calendar)?.year ?? year;
    const list = Array.from(
      { length: YEAR_OPTIONS_COUNT },
      (_, i) => currentYear - i,
    );
    // Keep the selected year in the list even if it falls outside it.
    if (!list.includes(year)) list.push(year);
    return list;
  }, [calendar, year]);

  // What the current selection means: the AD range to fetch, whether it is
  // ready to fetch, a message if it is not valid, and a label for the cards.
  const period = useMemo(() => {
    const none = {
      ready: false,
      startDate: "",
      endDate: "",
      problem: "",
      hint: "",
    };

    if (periodMode === "all") {
      return { ...none, ready: true, label: "All time" };
    }

    if (periodMode === "monthly") {
      const range = monthToRange(calendar, year, month);
      if (!range) {
        return {
          ...none,
          problem: "That month can't be converted. Try a different one.",
        };
      }
      return {
        ...none,
        ...range,
        ready: true,
        label: `${monthNames[month - 1]} ${year} ${calendar}`,
      };
    }

    if (periodMode === "yearly") {
      const range = yearToRange(calendar, year);
      if (!range) {
        return {
          ...none,
          problem: "That year can't be converted. Try a different one.",
        };
      }
      return { ...none, ...range, ready: true, label: `${year} ${calendar}` };
    }

    // Date range
    if (!fromDate || !toDate) {
      return { ...none, hint: "Pick both a From and a To date to apply." };
    }
    if (fromDate > toDate) {
      return {
        ...none,
        problem: 'The "From" date must be on or before the "To" date.',
      };
    }
    return {
      ...none,
      startDate: fromDate,
      endDate: toDate,
      ready: true,
      label: `${formatDateByMode(fromDate, fromMode)} – ${formatDateByMode(toDate, toMode)}`,
    };
  }, [
    periodMode,
    calendar,
    year,
    month,
    monthNames,
    fromDate,
    toDate,
    fromMode,
    toMode,
  ]);

  // Re-fetch whenever the selected period changes.
  useEffect(() => {
    if (!period.ready) {
      setLoading(false);
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");

    const loadSummary = async () => {
      try {
        const result = await fetchDashboardSummary({
          startDate: period.startDate,
          endDate: period.endDate,
        });
        if (requestId !== requestIdRef.current) return;
        setSummary(result.data);
        setAppliedLabel(period.label);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setSummary(null);
        setError(
          err.response?.data?.message || "Couldn't load dashboard summary.",
        );
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    };

    loadSummary();

    // Invalidates this request if the period changes again or the page closes.
    return () => {
      requestIdRef.current += 1;
    };
  }, [period.ready, period.startDate, period.endDate, period.label]);

  const handleCalendarChange = (next) => {
    if (next === calendar) return;
    // A BS year/month number means something different in AD, so reset the
    // selection to "this month / this year" of the newly chosen calendar.
    const today = getTodayParts(next);
    if (!today) return;
    setCalendar(next);
    setYear(today.year);
    setMonth(today.month);
  };

  const handleReset = () => {
    const today = getTodayParts("BS") || getTodayParts("AD");
    setPeriodMode("all");
    setCalendar(getTodayParts("BS") ? "BS" : "AD");
    setYear(today.year);
    setMonth(today.month);
    setFromDate("");
    setToDate("");
    setFromMode("BS");
    setToMode("BS");
  };

  const isFiltered = periodMode !== "all";

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">
        Stock value + Total sales + Purchase + Receivable + Payable + Expenses
      </p>

      <div className="quick-actions">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.to}
            type="button"
            className="quick-action-card"
            onClick={() => navigate(action.to)}
          >
            <span className="quick-action-icon">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* ------------------------- Sales / Purchase period filter ------------------------- */}
      <div className="report-filters">
        <div className="report-filters-row">
          <div className="filter-field filter-field-period" style={{ flex: "1 1 100%" }}>
            <label>Sales &amp; Purchase Period</label>
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
              {isFiltered && (
                <button
                  type="button"
                  className="period-toggle-btn"
                  onClick={handleReset}
                >
                  Reset
                </button>
              )}
            </div>

            {(periodMode === "monthly" || periodMode === "yearly") && (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <div className="date-input-toggle" style={{ marginBottom: 0 }}>
                  {["BS", "AD"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`date-toggle-btn${calendar === c ? " active" : ""}`}
                      onClick={() => handleCalendarChange(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                {periodMode === "monthly" && (
                  <select
                    aria-label="Month"
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    style={{ width: 160 }}
                  >
                    {monthNames.map((name, index) => (
                      <option key={name} value={index + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  aria-label="Year"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  style={{ width: 110 }}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {periodMode === "range" && (
              <div className="date-range-row">
                <DateInput
                  id="dashFromDate"
                  label="From"
                  value={fromDate}
                  onChange={setFromDate}
                  mode={fromMode}
                  onModeChange={setFromMode}
                />
                <DateInput
                  id="dashToDate"
                  label="To"
                  value={toDate}
                  onChange={setToDate}
                  mode={toMode}
                  onModeChange={setToMode}
                />
              </div>
            )}

            {period.problem && (
              <p className="error-text" style={{ margin: "10px 0 0", fontSize: 13 }}>
                {period.problem}
              </p>
            )}
            {period.hint && (
              <p className="field-hint" style={{ marginTop: 10 }}>
                {period.hint}
              </p>
            )}

            <p className="field-hint" style={{ marginTop: 10 }}>
              Applies to Total Sales and Total Purchase. Stock Value, Receivable,
              Payable and Expenses always show current / all-time figures.
            </p>
          </div>
        </div>
      </div>

      {loading && !summary && <p>Loading summary...</p>}
      {error && <p className="error-text">{error}</p>}

      {summary && (
        <div
          className="card-grid"
          style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.15s" }}
        >
          {CARD_CONFIG.map((card) => {
            const count = card.countKey ? (summary[card.countKey] ?? 0) : null;
            return (
              <div className="summary-card" key={card.key}>
                <span className="summary-card-label">{card.label}</span>
                <span className="summary-card-value">
                  {formatMoney(summary[card.key])}
                </span>
                {card.filtered && (
                  <span className="field-hint" style={{ marginTop: 0 }}>
                    {appliedLabel} · {count}{" "}
                    {count === 1 ? card.noun[0] : card.noun[1]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Dashboard;