import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchInvoices, deleteInvoice } from "../services/invoiceService";
import { formatDateByMode } from "../utils/bsDate";

const InvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const loadInvoices = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchInvoices();
      setInvoices(result.data);
    } catch (err) {
      setError("Couldn't load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleDelete = async (invoice) => {
    const confirmed = window.confirm(
      `Delete Invoice #${invoice.invoiceNumber}? Stock for its items will be restored.`,
    );
    if (!confirmed) return;

    try {
      await deleteInvoice(invoice._id);
      setInvoices((prev) => prev.filter((i) => i._id !== invoice._id));
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to delete invoice.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales — Invoice List</h1>
          <p className="page-subtitle">VAT invoices issued to customers.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/dashboard/sales/new")}
        >
          + Create Invoice
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && invoices.length === 0 && (
        <p className="page-subtitle">
          No invoices yet. Click "Create Invoice" to make one.
        </p>
      )}

      {!loading && !error && invoices.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Items</th>
                <th>Grand Total</th>
                <th>Received</th>
                <th>Due</th>
                <th className="table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice._id}>
                  <td>{formatDateByMode(invoice.date, invoice.dateMode)}</td>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{invoice.customer?.name || "—"}</td>
                  <td>{invoice.items.length}</td>
                  <td>{invoice.grandTotal.toLocaleString()}</td>
                  <td>{invoice.amountReceived.toLocaleString()}</td>
                  <td>
                    <span className={invoice.dueAmount > 0 ? "stock-low" : ""}>
                      {invoice.dueAmount.toLocaleString()}
                    </span>
                  </td>
                  <td className="table-actions-col">
                    <div className="table-actions">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() =>
                          navigate(`/dashboard/sales/${invoice._id}`)
                        }
                      >
                        View
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() =>
                          navigate(`/dashboard/sales/${invoice._id}/edit`)
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-outline btn-sm btn-danger"
                        onClick={() => handleDelete(invoice)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InvoiceList;