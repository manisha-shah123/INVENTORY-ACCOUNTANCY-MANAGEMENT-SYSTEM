import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchPurchases, deletePurchase } from "../services/purchaseService";
import { formatDateByMode } from "../utils/bsDate";

const PurchaseList = () => {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const loadPurchases = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchPurchases();
      setPurchases(result.data);
    } catch (err) {
      setError("Couldn't load purchases.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPurchases();
  }, []);

  const handleDelete = async (purchase) => {
    const confirmed = window.confirm(
      `Delete this purchase of ${purchase.quantity} ${purchase.product?.unit || ""} of ${purchase.product?.name}? This will reverse the stock it added.`,
    );
    if (!confirmed) return;

    try {
      await deletePurchase(purchase._id);
      setPurchases((prev) => prev.filter((p) => p._id !== purchase._id));
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to delete purchase.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase</h1>
          <p className="page-subtitle">Stock received from suppliers.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/dashboard/purchases/new")}
        >
          + New Purchase
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && purchases.length === 0 && (
        <p className="page-subtitle">
          No purchases yet. Click "New Purchase" to record one.
        </p>
      )}

      {!loading && !error && purchases.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>Product</th>
                <th>Invoice #</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
                <th className="table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase._id}>
                  <td>{formatDateByMode(purchase.date, purchase.dateMode)}</td>
                  <td>{purchase.supplier?.name || "—"}</td>
                  <td>
                    {purchase.product?.name} ({purchase.product?.sku})
                  </td>
                  <td>{purchase.invoiceNumber || "—"}</td>
                  <td>
                    {purchase.quantity} {purchase.product?.unit}
                  </td>
                  <td>{purchase.rate.toLocaleString()}</td>
                  <td>{purchase.total.toLocaleString()}</td>
                  <td>{purchase.amountPaid.toLocaleString()}</td>
                  <td>
                    <span className={purchase.dueAmount > 0 ? "stock-low" : ""}>
                      {purchase.dueAmount.toLocaleString()}
                    </span>
                  </td>
                  <td className="table-actions-col">
                    <button
                      className="btn btn-outline btn-sm btn-danger"
                      onClick={() => handleDelete(purchase)}
                    >
                      Delete
                    </button>
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

export default PurchaseList;
