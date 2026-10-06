import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchBalanceSheet } from "../services/balanceSheetService";
import {
  PERIOD_OPTIONS,
  currentFiscalStartYear,
  fiscalYearLabel,
  fiscalYearOptions,
  resolvePeriod,
} from "../utils/balancePeriods";
import BalanceStatement from "../components/balance/BalanceStatement";
import OpeningBalances from "../components/balance/OpeningBalances";
import OtherEntries from "../components/balance/OtherEntries";

const TABS = [
  { key: "statement", label: "Balance Sheet" },
  { key: "entries", label: "Other Entries" },
  { key: "opening", label: "Opening Balances" },
];

const BalanceSheet = () => {
  const { admin } = useAuth();

  const [tab, setTab] = useState("statement");
  const [fiscalYear, setFiscalYear] = useState(() => currentFiscalStartYear());
  const [periodValue, setPeriodValue] = useState("year");

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Bumped whenever opening balances / entries change so the statement reloads.
  const [refreshKey, setRefreshKey] = useState(0);

  const years = useMemo(() => fiscalYearOptions(8), []);
  const resolved = useMemo(
    () => resolvePeriod(fiscalYear, periodValue),
    [fiscalYear, periodValue],
  );

  useEffect(() => {
    if (tab !== "statement" || !resolved.ok) return undefined;

    let cancelled = false;
    const params = { asOf: resolved.asOf, fyStart: resolved.fyStart };
    if (resolved.prevAsOf && resolved.prevFyStart) {
      params.prevAsOf = resolved.prevAsOf;
      params.prevFyStart = resolved.prevFyStart;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      // Never show the previous period's numbers under the new period's title.
      setResult(null);
      try {
        const response = await fetchBalanceSheet(params);
        if (!cancelled) setResult(response.data);
      } catch (err) {
        if (!cancelled) {
          setResult(null);
          setError(
            err.response?.data?.message || "Couldn't load the balance sheet.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [tab, resolved, refreshKey]);

  const bump = () => setRefreshKey((k) => k + 1);

  const fyLabel = fiscalYearLabel(fiscalYear);
  const hasStatement = resolved.ok && Boolean(result?.current);

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Balance Sheet</h1>
          <p className="page-subtitle">
            Calculated automatically from your records. Choose a fiscal year and
            a period.
          </p>
        </div>
        {tab === "statement" && hasStatement && (
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => window.print()}
          >
            Print
          </button>
        )}
      </div>

      <div className="bs-tabs no-print" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`bs-tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "statement" && (
        <>
          <div className="bs-controls no-print">
            <div className="bs-control">
              <label htmlFor="bs-year">Fiscal Year</label>
              <select
                id="bs-year"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y.value} value={y.value}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="bs-control">
              <label htmlFor="bs-period">Period</label>
              <select
                id="bs-period"
                value={periodValue}
                onChange={(e) => setPeriodValue(e.target.value)}
              >
                <optgroup label="Yearly">
                  {PERIOD_OPTIONS.filter((p) => p.group === "year").map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Quarterly">
                  {PERIOD_OPTIONS.filter((p) => p.group === "quarter").map(
                    (p) => (
                      <option key={p.value} value={p.value}>
                        {p.label} ({p.sub})
                      </option>
                    ),
                  )}
                </optgroup>
                <optgroup label="Monthly">
                  {PERIOD_OPTIONS.filter((p) => p.group === "month").map(
                    (p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ),
                  )}
                </optgroup>
              </select>
            </div>
          </div>

          <BalanceStatement
            resolved={resolved}
            fyLabel={fyLabel}
            result={result}
            loading={loading}
            error={error}
            companyName={admin?.companyName}
            onEnterOpening={() => setTab("opening")}
          />
        </>
      )}

      {tab === "entries" && <OtherEntries onChanged={bump} />}
      {tab === "opening" && <OpeningBalances onSaved={bump} />}
    </div>
  );
};

export default BalanceSheet;
