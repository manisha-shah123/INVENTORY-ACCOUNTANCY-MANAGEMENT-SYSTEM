import { adToBsSafe, formatBsFromAd } from "../../utils/bsDate";
import { formatMoney } from "../../utils/balanceFormat";

// What each line means, in plain words.
const SECTIONS = [
  {
    title: "Assets",
    subtitle: "What the business owns",
    totalKey: "totalAssets",
    totalLabel: "Total Assets",
    lines: [
      {
        key: "cash",
        label: "Cash in Hand",
        hint: "Cash received minus cash paid out",
      },
      {
        key: "bank",
        label: "Bank Balance",
        hint: "Money received in the bank minus money paid from it",
      },
      {
        key: "accountsReceivable",
        label: "Accounts Receivable",
        hint: "Money customers still owe you",
      },
      {
        key: "inventory",
        label: "Inventory (Stock)",
        hint: "Stock on hand, valued at average purchase cost",
      },
      {
        key: "otherCurrentAssets",
        label: "Other Current Assets",
        hint: "Refunds or overpayments owed back to you (supplier, VAT, loan)",
        hideIfZero: true,
      },
      {
        key: "fixedAssets",
        label: "Fixed Assets",
        hint: "Machinery, vehicles, furniture etc. after depreciation",
      },
    ],
  },
  {
    title: "Liabilities",
    subtitle: "What the business owes",
    totalKey: "totalLiabilities",
    totalLabel: "Total Liabilities",
    lines: [
      {
        key: "accountsPayable",
        label: "Accounts Payable",
        hint: "Money you still owe suppliers",
      },
      {
        key: "vatPayable",
        label: "VAT Payable",
        hint: "VAT collected from customers and not yet paid to the government",
      },
      {
        key: "loans",
        label: "Loans",
        hint: "Money borrowed and not yet repaid",
      },
      {
        key: "otherCurrentLiabilities",
        label: "Other Current Liabilities",
        hint: "Customers who paid you more than they owed",
        hideIfZero: true,
      },
    ],
  },
  {
    title: "Equity",
    subtitle: "What belongs to the owner",
    totalKey: "totalEquity",
    totalLabel: "Total Equity",
    lines: [
      {
        key: "capital",
        label: "Owner's Capital",
        hint: "Money the owner put in, less money taken out",
      },
      {
        key: "retainedEarnings",
        label: "Retained Earnings",
        hint: "Profit kept from earlier fiscal years",
      },
      {
        key: "currentYearProfit",
        label: "Profit This Fiscal Year",
        hint: "Profit from the start of the fiscal year up to this date",
      },
    ],
  },
];

const dateHeader = (adIso) => ({
  bs: formatBsFromAd(adIso),
  ad: `${adIso} AD`,
});

const periodTitle = (resolved, fyLabel) => {
  const { option } = resolved;
  if (option.group === "month") {
    const bs = adToBsSafe(resolved.periodStart);
    return `${option.label} ${bs ? bs.slice(0, 4) : ""}`.trim();
  }
  return `${option.label} · Fiscal Year ${fyLabel}`;
};

const previousLabel = (group) =>
  group === "month"
    ? "Previous month"
    : group === "quarter"
      ? "Previous quarter"
      : "Previous year";

/**
 * The balance sheet itself: header, notices, the table and the notes.
 * Purely presentational. The page fetches the data and passes it in.
 */
const BalanceStatement = ({
  resolved,
  fyLabel,
  result,
  loading,
  error,
  companyName,
  onEnterOpening,
}) => {
  const current = result?.current;
  const previous = result?.previous;
  const allWarnings = [
    ...(current?.warnings || []),
    ...(result?.warnings || []),
  ];

  if (!resolved.ok) {
    return <p className="page-subtitle">{resolved.problem}</p>;
  }
  if (error) return <p className="error-text">{error}</p>;
  if (loading && !current) return <p>Loading...</p>;
  if (!current) return null;

  const head = dateHeader(resolved.asOf);
  const prevHead = previous ? dateHeader(resolved.prevAsOf) : null;

  return (
    <div className={loading ? "bs-stale" : undefined}>
      {!result.openingSet && (
        <div className="bs-notice no-print">
          You have not entered your opening balances yet, so cash, bank, fixed
          assets and loans start from zero.{" "}
          <button
            type="button"
            className="btn-link"
            onClick={onEnterOpening}
          >
            Enter opening balances
          </button>
        </div>
      )}

      {allWarnings.map((message) => (
        <div className="bs-warning" key={message}>
          {message}
        </div>
      ))}

      <div className="bs-statement">
        <div className="bs-statement-header">
          <div className="bs-company">
            {companyName || "Inventory MS"}
          </div>
          <h2>Balance Sheet</h2>
          <div className="bs-period-title">
            {periodTitle(resolved, fyLabel)}
          </div>
          <div className="bs-asat">
            As at {head.bs} <span>({head.ad})</span>
          </div>
          {resolved.isPartial && (
            <div className="bs-partial">
              This period has not ended yet. Figures include everything
              recorded up to today.
            </div>
          )}
        </div>

        <div className="table-wrapper">
          <table className="data-table bs-table">
            <thead>
              <tr>
                <th>Particulars</th>
                <th className="num">
                  {head.bs}
                  <small>This period</small>
                </th>
                {previous && (
                  <th className="num">
                    {prevHead.bs}
                    <small>{previousLabel(resolved.option.group)}</small>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <SectionRows
                  key={section.title}
                  section={section}
                  current={current}
                  previous={previous}
                />
              ))}

              <tr className="bs-grand-row">
                <td>Total Liabilities + Equity</td>
                <td className="num">
                  {formatMoney(current.totals.liabilitiesAndEquity)}
                </td>
                {previous && (
                  <td className="num">
                    {formatMoney(previous.totals.liabilitiesAndEquity)}
                  </td>
                )}
              </tr>
              <tr className="bs-check-row">
                <td>Check: Assets = Liabilities + Equity</td>
                <CheckCell column={current} />
                {previous && <CheckCell column={previous} />}
              </tr>
            </tbody>
          </table>
        </div>

        <details className="bs-notes no-print">
          <summary>How are these numbers worked out?</summary>
          <ul>
            <li>
              Everything is calculated automatically from your invoices,
              purchases, payments, receipts, expenses and stock. You do not
              type these numbers.
            </li>
            <li>
              <strong>Profit</strong> = sales (without VAT) − cost of goods
              sold − expenses − depreciation. Cost of goods sold = opening
              stock + purchases − stock left.
            </li>
            <li>
              <strong>Inventory</strong> is valued at the average price you
              paid. The Dashboard values stock at each product's purchase
              price, so the two can differ.
            </li>
            <li>
              <strong>Owner's Capital</strong> starts from your opening
              balances. Add money you put in or take out under Other Entries.
            </li>
            <li>
              Compare Cash and Bank with your cash drawer and bank statement.
              If they differ, something is missing; record it under Other
              Entries.
            </li>
            <li>
              Profit before the start of the fiscal year (Shrawan 1) is shown
              as Retained Earnings; profit since then is Profit This Fiscal
              Year.
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
};

const SectionRows = ({ section, current, previous }) => (
  <>
    <tr className="bs-section-row">
      <td colSpan={previous ? 3 : 2}>
        {section.title} <span>{section.subtitle}</span>
      </td>
    </tr>

    {section.lines.map((line) => {
      const cur = current.balances[line.key];
      const prev = previous ? previous.balances[line.key] : 0;
      if (line.hideIfZero && !cur && !prev) return null;
      return (
        <tr key={line.key}>
          <td className="bs-line">
            {line.label}
            <small>{line.hint}</small>
          </td>
          <td className="num">{formatMoney(cur)}</td>
          {previous && <td className="num">{formatMoney(prev)}</td>}
        </tr>
      );
    })}

    <tr className="bs-total-row">
      <td>{section.totalLabel}</td>
      <td className="num">{formatMoney(current.totals[section.totalKey])}</td>
      {previous && (
        <td className="num">{formatMoney(previous.totals[section.totalKey])}</td>
      )}
    </tr>
  </>
);

const CheckCell = ({ column }) => (
  <td className={`num ${column.isBalanced ? "bs-ok" : "bs-bad"}`}>
    {column.isBalanced
      ? "✓ Balanced"
      : `Difference ${formatMoney(column.totals.difference)}`}
  </td>
);

export default BalanceStatement;
