import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { deleteReceipt, fetchReceiptById } from "../services/receiptService";
import { formatDateByMode } from "../utils/bsDate";
import { formatAmount } from "../utils/receipts";

const ReceiptView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { admin } = useAuth();

  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchReceiptById(id);
        setReceipt(result.data);
      } catch (err) {
        setError("Couldn't load this receipt.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Delete receipt ${receipt.receiptNumber}? The ${formatAmount(receipt.amount)} will be added back to the customer's due amount on the invoices it paid.`,
    );
    if (!confirmed) return;

    try {
      await deleteReceipt(receipt._id);
      navigate("/dashboard/hisab-kitab", { replace: true });
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to delete receipt.");
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!receipt) return null;

  const customerId = receipt.customer?._id;
  const customerName = receipt.customer?.name || receipt.customerName || "—";

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Receipt {receipt.receiptNumber}</h1>
          <p className="page-subtitle">
            {customerName} · {formatDateByMode(receipt.date, receipt.dateMode)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-outline"
            onClick={() => navigate("/dashboard/hisab-kitab")}
          >
            Back to List
          </button>
          {customerId && (
            <button
              className="btn btn-outline"
              onClick={() =>
                navigate(`/dashboard/customers/${customerId}/statement`)
              }
            >
              Customer Statement
            </button>
          )}
          <button
            className="btn btn-outline"
            onClick={() => navigate(`/dashboard/hisab-kitab/receipts/${id}/edit`)}
          >
            Edit Receipt
          </button>
          <button className="btn btn-outline btn-danger" onClick={handleDelete}>
            Delete Receipt
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            Print Receipt
          </button>
        </div>
      </div>

      <div className="bill-print-area">
        <div className="bill-header">
          <h2 className="bill-company-name">
            {admin?.companyName || "Inventory MS"}
          </h2>
          <p className="bill-doc-title">Payment Receipt</p>
        </div>

        <div className="bill-meta-grid">
          <div>
            <p>
              <strong>Receipt No:</strong> {receipt.receiptNumber}
            </p>
            <p>
              <strong>Date:</strong>{" "}
              {formatDateByMode(receipt.date, receipt.dateMode)}
            </p>
            <p style={{ textTransform: "capitalize" }}>
              <strong>Payment Method:</strong> {receipt.method}
            </p>
          </div>
          <div>
            <p>
              <strong>Received From:</strong> {customerName}
            </p>
            {receipt.customer?.vatNumber && (
              <p>
                <strong>VAT Number:</strong> {receipt.customer.vatNumber}
              </p>
            )}
            {receipt.customer?.address && (
              <p>
                <strong>Address:</strong> {receipt.customer.address}
              </p>
            )}
            {receipt.customer?.phone && (
              <p>
                <strong>Contact:</strong> {receipt.customer.phone}
              </p>
            )}
          </div>
        </div>

        <div className="receipt-amount-box">
          <span>Amount Received</span>
          <strong>NPR {formatAmount(receipt.amount)}</strong>
        </div>

        <h4 className="receipt-section-title">Applied to invoices</h4>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>SN</th>
                <th>Invoice #</th>
                <th>Invoice Date</th>
                <th className="num">Invoice Total</th>
                <th className="num">Due Before</th>
                <th className="num">Paid Now</th>
                <th className="num">Due After</th>
              </tr>
            </thead>
            <tbody>
              {receipt.allocations.map((a, index) => (
                <tr key={`${a.invoice}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{a.invoiceNumber}</td>
                  <td>{formatDateByMode(a.invoiceDate, a.invoiceDateMode)}</td>
                  <td className="num">{formatAmount(a.invoiceTotal)}</td>
                  <td className="num">{formatAmount(a.dueBefore)}</td>
                  <td className="num">{formatAmount(a.amount)}</td>
                  <td className="num">
                    {a.dueAfter === 0 ? "Cleared" : formatAmount(a.dueAfter)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bill-totals">
          <div className="bill-totals-row">
            <span>Total Receivable Before:</span>
            <strong>{formatAmount(receipt.dueBefore)}</strong>
          </div>
          <div className="bill-totals-row">
            <span>Amount Received:</span>
            <strong>{formatAmount(receipt.amount)}</strong>
          </div>
          <div className="bill-totals-row bill-totals-grand">
            <span>Balance Receivable:</span>
            <strong>{formatAmount(receipt.dueAfter)}</strong>
          </div>
        </div>

        {receipt.remarks && (
          <div className="bill-remarks">
            <strong>Remarks:</strong> {receipt.remarks}
          </div>
        )}

        <div className="receipt-signatures">
          <div>
            <span>Customer's signature</span>
          </div>
          <div>
            <span>Received by</span>
          </div>
        </div>

        <p className="bill-footer-note">
          Thank you for your payment.{" "}
          {customerId && (
            <Link className="no-print" to={`/dashboard/customers/${customerId}/statement`}>
              View account statement
            </Link>
          )}
        </p>
      </div>
    </div>
  );
};

export default ReceiptView;
