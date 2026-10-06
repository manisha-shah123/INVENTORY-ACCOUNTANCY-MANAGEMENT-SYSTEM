import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchProductById,
  adjustStock,
  fetchStockHistory,
} from "../services/productService";
import {
  fetchPurchasesByProduct,
  createPurchaseReturn,
} from "../services/purchaseService";
import DateInput from "../components/DateInput";

const StockAdjustment = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // "out" is the only type handled on this page — "in" redirects to Purchases.
  const [type, setType] = useState("out");

  // For Stock Out, the user picks between a plain stock-out and a purchase return.
  const [outMode, setOutMode] = useState("general"); // "general" | "return"

  const [generalForm, setGeneralForm] = useState({ quantity: "", reason: "" });

  const [purchases, setPurchases] = useState([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [returnForm, setReturnForm] = useState({
    purchaseId: "",
    quantity: "",
    date: "",
    dateMode: "BS",
    reason: "",
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [productResult, historyResult] = await Promise.all([
        fetchProductById(id),
        fetchStockHistory(id),
      ]);
      setProduct(productResult.data);
      setHistory(historyResult.data);
    } catch (err) {
      setError("Couldn't load this product's stock details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (outMode !== "return") return;

    const loadPurchases = async () => {
      setLoadingPurchases(true);
      try {
        const result = await fetchPurchasesByProduct(id);
        setPurchases(result.data);
      } catch (err) {
        setFormError("Couldn't load purchases for this product.");
      } finally {
        setLoadingPurchases(false);
      }
    };

    loadPurchases();
  }, [outMode, id]);

  const handleTypeChange = (event) => {
    const value = event.target.value;
    if (value === "in") {
      // Stock In must always originate from a Purchase record.
      // Send the user to the Purchase form with this product pre-filled.
      navigate(`/dashboard/purchases/new?productId=${id}`);
      return;
    }
    setType("out");
  };

  const handleGeneralChange = (field) => (event) => {
    setGeneralForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleReturnChange = (field) => (event) => {
    setReturnForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const eligiblePurchases = purchases.filter(
    (p) => p.quantity - (p.returnedQuantity || 0) > 0,
  );
  const selectedPurchase = purchases.find(
    (p) => p._id === returnForm.purchaseId,
  );
  const returnable = selectedPurchase
    ? selectedPurchase.quantity - (selectedPurchase.returnedQuantity || 0)
    : 0;

  const handleGeneralSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    const qty = Number(generalForm.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      setFormError("Quantity must be a whole number greater than 0.");
      return;
    }

    setSaving(true);
    try {
      const result = await adjustStock(id, {
        type: "out",
        quantity: qty,
        reason: generalForm.reason,
      });
      setProduct(result.data.product);
      setHistory((prev) => [result.data.movement, ...prev]);
      setGeneralForm({ quantity: "", reason: "" });
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to update stock.");
    } finally {
      setSaving(false);
    }
  };

  const handleReturnSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    if (!returnForm.purchaseId) {
      setFormError("Please select which purchase you're returning.");
      return;
    }

    const qty = Number(returnForm.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      setFormError("Quantity must be a whole number greater than 0.");
      return;
    }
    if (qty > returnable) {
      setFormError(
        `Only ${returnable} ${product.unit} can be returned from this purchase.`,
      );
      return;
    }
    if (!returnForm.date) {
      setFormError("Please select a return date.");
      return;
    }

    setSaving(true);
    try {
      const result = await createPurchaseReturn(returnForm.purchaseId, {
        quantity: qty,
        date: returnForm.date,
        dateMode: returnForm.dateMode,
        reason: returnForm.reason,
      });
      setProduct(result.data.product);
      setHistory((prev) => [result.data.movement, ...prev]);
      setPurchases((prev) =>
        prev.map((p) =>
          p._id === returnForm.purchaseId
            ? { ...p, returnedQuantity: (p.returnedQuantity || 0) + qty }
            : p,
        ),
      );
      setReturnForm({
        purchaseId: "",
        quantity: "",
        date: "",
        dateMode: "BS",
        reason: "",
      });
    } catch (err) {
      setFormError(
        err.response?.data?.message || "Failed to record purchase return.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p>Loading...</p>;
  }

  if (error || !product) {
    return <p className="error-text">{error || "Product not found."}</p>;
  }

  return (
    <div>
      <h1 className="page-title">Adjust Stock — {product.name}</h1>
      <p className="page-subtitle">
        Current stock:{" "}
        <strong>
          {product.currentStock} {product.unit}
        </strong>
        {product.currentStock <= product.minimumStock && (
          <span className="badge-low" style={{ marginLeft: 8 }}>
            Low
          </span>
        )}
      </p>

      <div className="form-card" style={{ marginBottom: 32 }}>
        <div className="login-field">
          <label htmlFor="type">Type</label>
          <select id="type" value={type} onChange={handleTypeChange}>
            <option value="out">Stock Out</option>
            <option value="in">Stock In (via Purchase)</option>
          </select>
          <small className="field-hint">
            Stock In takes you to the Purchases form so a purchase record is
            created for it. This page only handles Stock Out.
          </small>
        </div>

        <div className="login-field">
          <label htmlFor="outMode">Stock Out Reason</label>
          <select
            id="outMode"
            value={outMode}
            onChange={(e) => {
              setFormError("");
              setOutMode(e.target.value);
            }}
          >
            <option value="general">
              General Stock Out (sold, damaged, lost...)
            </option>
            <option value="return">Purchase Return (send back to supplier)</option>
          </select>
        </div>

        {outMode === "general" && (
          <form onSubmit={handleGeneralSubmit}>
            <div className="login-field">
              <label htmlFor="quantity">Quantity</label>
              <input
                id="quantity"
                type="number"
                min="1"
                step="1"
                value={generalForm.quantity}
                onChange={handleGeneralChange("quantity")}
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="reason">Reason / Note</label>
              <input
                id="reason"
                type="text"
                placeholder="e.g. Damaged goods, Sold to customer"
                value={generalForm.reason}
                onChange={handleGeneralChange("reason")}
              />
            </div>

            {formError && <p className="error-text">{formError}</p>}

            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => navigate("/dashboard/products")}
              >
                Back to Products
              </button>
            </div>
          </form>
        )}

        {outMode === "return" && (
          <form onSubmit={handleReturnSubmit}>
            {loadingPurchases && <p>Loading purchases...</p>}

            {!loadingPurchases && eligiblePurchases.length === 0 && (
              <p className="page-subtitle">
                No returnable purchases found for this product. Purchase
                Return can only be recorded against a purchase that still has
                unreturned quantity.
              </p>
            )}

            {!loadingPurchases && eligiblePurchases.length > 0 && (
              <>
                <div className="login-field">
                  <label htmlFor="purchaseId">Select Purchase</label>
                  <select
                    id="purchaseId"
                    value={returnForm.purchaseId}
                    onChange={handleReturnChange("purchaseId")}
                    required
                  >
                    <option value="">-- Select Purchase --</option>
                    {eligiblePurchases.map((p) => {
                      const left = p.quantity - (p.returnedQuantity || 0);
                      return (
                        <option key={p._id} value={p._id}>
                          Inv #{p.invoiceNumber} — {p.supplier?.name} — {left}{" "}
                          {product.unit} returnable (rate {p.rate})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {selectedPurchase && (
                  <p className="page-subtitle">
                    Purchased {selectedPurchase.quantity} {product.unit} from{" "}
                    <strong>{selectedPurchase.supplier?.name}</strong> at rate{" "}
                    {selectedPurchase.rate}.{" "}
                    {selectedPurchase.returnedQuantity > 0 &&
                      `Already returned ${selectedPurchase.returnedQuantity}. `}
                    Up to <strong>{returnable}</strong> {product.unit} can
                    still be returned.
                  </p>
                )}

                <div className="login-field">
                  <label htmlFor="returnQuantity">Quantity to Return</label>
                  <input
                    id="returnQuantity"
                    type="number"
                    min="1"
                    max={returnable || undefined}
                    step="1"
                    value={returnForm.quantity}
                    onChange={handleReturnChange("quantity")}
                    required
                    disabled={!returnForm.purchaseId}
                  />
                </div>

                <div className="login-field">
                  <DateInput
                    id="returnDate"
                    label="Return Date"
                    value={returnForm.date}
                    onChange={(adIso) =>
                      setReturnForm((prev) => ({ ...prev, date: adIso }))
                    }
                    mode={returnForm.dateMode}
                    onModeChange={(m) =>
                      setReturnForm((prev) => ({ ...prev, dateMode: m }))
                    }
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="returnReason">Reason / Note</label>
                  <input
                    id="returnReason"
                    type="text"
                    placeholder="e.g. Wrong item, Defective, Excess delivered"
                    value={returnForm.reason}
                    onChange={handleReturnChange("reason")}
                  />
                </div>
              </>
            )}

            {formError && <p className="error-text">{formError}</p>}

            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving || eligiblePurchases.length === 0}
              >
                {saving ? "Saving..." : "Record Return"}
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => navigate("/dashboard/products")}
              >
                Back to Products
              </button>
            </div>
          </form>
        )}
      </div>

      <h2 className="page-title" style={{ fontSize: 18 }}>
        Stock History
      </h2>

      {history.length === 0 && (
        <p className="page-subtitle">No stock movements yet.</p>
      )}

      {history.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Reason</th>
                <th>Balance After</th>
              </tr>
            </thead>
            <tbody>
              {history.map((movement) => (
                <tr key={movement._id}>
                  <td>{new Date(movement.createdAt).toLocaleString()}</td>
                  <td>
                    <span
                      className={movement.type === "in" ? "tag-in" : "tag-out"}
                    >
                      {movement.type === "in" ? "Stock In" : "Stock Out"}
                    </span>
                  </td>
                  <td>
                    {movement.quantity} {product.unit}
                  </td>
                  <td>{movement.reason || "—"}</td>
                  <td>
                    {movement.balanceAfter} {product.unit}
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

export default StockAdjustment;