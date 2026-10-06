import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchCustomerSummary } from "../services/receiptService";
import { formatDateByMode, todayAdIso } from "../utils/bsDate";
import { describeAppliedTo, formatAmount } from "../utils/receipts";

const STATUS_TAGS = {
  paid: { className: "tag-in", label: "Paid" },
  partial: { className: "tag-out", label: "Partial" },
  unpaid: { className: "tag-due", label: "Unpaid" },
};

const CustomerStatement = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { admin } = useAuth();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchCustomerSummary(id);
        setSummary(result.data);
      } catch (err) {
        setError(
          err.response?.data?.message || "Couldn't load this customer's account.",
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!summary) return null;

  const { customer, totals, invoices, history } = summary;

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Customer Statement — {customer.name}</h1>
          <p className="page-subtitle">
            Every invoice, payment and the balance still to be received.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-outline"
            onClick={() => navigate("/dashboard/customers")}
          >
            Back to Customers
          </button>
          <button className="btn btn-outline" onClick={() => window.print()}>
            Print Statement
          </button>
          {totals.totalDue > 0 && (
            <button
              className="btn btn-primary"
              onClick={() =>
                navigate(`/dashboard/hisab-kitab/receive?customer=${id}`)
              }
            >
              Receive Payment
            </button>
          )}
        </div>
      </div>

      <div className="bill-print-area statement-area">
        <div className="bill-header">
          <h2 className="bill-company-name">
            {admin?.companyName || "Inventory MS"}
          </h2>
          <p className="bill-doc-title">Customer Account Statement</p>
        </div>

        <div className="bill-meta-grid">
          <div>
            <p>
              <strong>Customer:</strong> {customer.name}
            </p>
            {customer.vatNumber && (
              <p>
                <strong>VAT Number:</strong> {customer.vatNumber}
              </p>
            )}
            {customer.address && (
              <p>
                <strong>Address:</strong> {customer.address}
              </p>
            )}
            {customer.phone && (
              <p>
                <strong>Contact:</strong> {customer.phone}
              </p>
            )}
          </div>
          <div>
            <p>
              <strong>Statement date:</strong>{" "}
              {formatDateByMode(todayAdIso(), "BS")}
            </p>
            <p>
              <strong>Invoices:</strong> {totals.invoiceCount}
            </p>
            <p>
              <strong>Payments received:</strong> {totals.receiptCount} receipt
              {totals.receiptCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="card-grid statement-cards">
          <div className="summary-card">
            <span className="summary-card-label">Total Billed</span>
            <span className="summary-card-value">
              {formatAmount(totals.totalBilled)}
            </span>
          </div>
          <div className="summary-card">
            <span className="summary-card-label">Total Received</span>
            <span className="summary-card-value">
              {formatAmount(totals.totalReceived)}
            </span>
          </div>
          <div className="summary-card">
            <span className="summary-card-label">Balance Due</span>
            <span
              className={`summary-card-value${totals.totalDue > 0 ? " stock-low" : ""}`}
            >
              {formatAmount(totals.totalDue)}
            </span>
          </div>
        </div>

        <h3 className="statement-section-title">Invoices</h3>
        {invoices.length === 0 ? (
          <p className="page-subtitle">No invoices for this customer yet.</p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice #</th>
                  <th className="num">Total</th>
                  <th className="num">Received</th>
                  <th className="num">Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const tag = STATUS_TAGS[inv.status];
                  return (
                    <tr key={inv._id}>
                      <td>{formatDateByMode(inv.date, inv.dateMode)}</td>
                      <td>
                        <Link to={`/dashboard/sales/${inv._id}`}>
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="num">{formatAmount(inv.grandTotal)}</td>
                      <td className="num">{formatAmount(inv.amountReceived)}</td>
                      <td className="num">{formatAmount(inv.dueAmount)}</td>
                      <td>
                        <span className={tag.className}>{tag.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="tfoot-label">
                    Total
                  </td>
                  <td className="num">{formatAmount(totals.totalBilled)}</td>
                  <td className="num">{formatAmount(totals.totalReceived)}</td>
                  <td className="num">{formatAmount(totals.totalDue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <h3 className="statement-section-title">Payment History</h3>
        {history.length === 0 ? (
          <p className="page-subtitle">No payments received yet.</p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Applied To</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th className="table-actions-col no-print">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={`${h.kind}-${h.id}`}>
                    <td>{formatDateByMode(h.date, h.dateMode)}</td>
                    <td>
                      {h.kind === "receipt"
                        ? h.receiptNumber
                        : h.kind === "at_sale"
                          ? "At invoice time"
                          : "Payment"}
                    </td>
                    <td>{describeAppliedTo(h.appliedTo)}</td>
                    <td style={{ textTransform: "capitalize" }}>
                      {h.method || "—"}
                    </td>
                    <td className="num">{formatAmount(h.amount)}</td>
                    <td className="table-actions-col no-print">
                      {h.kind === "receipt" && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() =>
                            navigate(`/dashboard/hisab-kitab/receipts/${h.id}`)
                          }
                        >
                          View Receipt
                        </button>
                      )}
                      {h.kind === "payment" && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => navigate(`/dashboard/hisab-kitab/${h.id}`)}
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="tfoot-label">
                    Total received
                  </td>
                  <td className="num">{formatAmount(totals.totalReceived)}</td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerStatement;
