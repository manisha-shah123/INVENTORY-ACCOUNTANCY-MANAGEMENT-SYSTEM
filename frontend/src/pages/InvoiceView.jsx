import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchInvoiceById } from "../services/invoiceService";
import { formatDateByMode } from "../utils/bsDate";
import { useAuth } from "../context/AuthContext";

const InvoiceView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { admin } = useAuth();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchInvoiceById(id);
        setInvoice(result.data);
      } catch (err) {
        setError("Couldn't load this invoice.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleGenerateBill = () => {
    window.print();
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!invoice) return null;

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Invoice #{invoice.invoiceNumber}</h1>
          <p className="page-subtitle">
            {invoice.customer?.name || "-"} ·{" "}
            {formatDateByMode(invoice.date, invoice.dateMode)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-outline"
            onClick={() => navigate("/dashboard/sales")}
          >
            Back to List
          </button>
          <button
            className="btn btn-outline"
            onClick={() => navigate(`/dashboard/sales/${id}/edit`)}
          >
            Edit Invoice
          </button>
          <button className="btn btn-primary" onClick={handleGenerateBill}>
            Generate Bill
          </button>
        </div>
      </div>

      <div className="bill-print-area">
        <div className="bill-header">
          <h2 className="bill-company-name">
            {admin?.companyName || "Inventory MS"}
          </h2>
          <p className="bill-doc-title">Sales Invoice</p>
        </div>

        <div className="bill-meta-grid">
          <div>
            <p>
              <strong>Invoice #:</strong> {invoice.invoiceNumber}
            </p>
            <p>
              <strong>Date:</strong>{" "}
              {formatDateByMode(invoice.date, invoice.dateMode)}
            </p>
            <p>
              <strong>Payment Mode:</strong> {invoice.paymentMode}
            </p>
          </div>
          <div>
            <p>
              <strong>Client:</strong>{" "}
              {invoice.buyerName || invoice.customer?.name || "-"}
            </p>
            {invoice.vatNumber && (
              <p>
                <strong>VAT Number:</strong> {invoice.vatNumber}
              </p>
            )}
            {invoice.address && (
              <p>
                <strong>Address:</strong> {invoice.address}
              </p>
            )}
            {invoice.contactNumber && (
              <p>
                <strong>Contact:</strong> {invoice.contactNumber}
              </p>
            )}
          </div>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>SN</th>
                <th>Product</th>
                <th>HS Code</th>
                <th>Grade</th>
                <th>Size</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{item.product?.name || "-"}</td>
                  <td>{item.hsCode || "-"}</td>
                  <td>{item.grade || "-"}</td>
                  <td>{item.size || "-"}</td>
                  <td>{item.quantity}</td>
                  <td>{item.rate.toLocaleString()}</td>
                  <td>{(item.quantity * item.rate).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bill-totals">
          <div className="bill-totals-row">
            <span>Subtotal:</span>
            <strong>{invoice.subtotal.toLocaleString()}</strong>
          </div>
          <div className="bill-totals-row">
            <span>Discount:</span>
            <strong>{invoice.discount.toLocaleString()}</strong>
          </div>
          <div className="bill-totals-row">
            <span>Taxable Amount:</span>
            <strong>{invoice.taxableAmount.toLocaleString()}</strong>
          </div>
          <div className="bill-totals-row">
            <span>VAT (13%):</span>
            <strong>{invoice.vatAmount.toLocaleString()}</strong>
          </div>
          <div className="bill-totals-row bill-totals-grand">
            <span>Grand Total:</span>
            <strong>{invoice.grandTotal.toLocaleString()}</strong>
          </div>
          <div className="bill-totals-row">
            <span>Amount Received:</span>
            <strong>{invoice.amountReceived.toLocaleString()}</strong>
          </div>
          <div className="bill-totals-row">
            <span>Due Amount:</span>
            <strong>{invoice.dueAmount.toLocaleString()}</strong>
          </div>
        </div>

        {invoice.remarks && (
          <div className="bill-remarks">
            <strong>Remarks:</strong> {invoice.remarks}
          </div>
        )}

        <p className="bill-footer-note">This bill is estimate bill</p>
      </div>
    </div>
  );
};

export default InvoiceView;