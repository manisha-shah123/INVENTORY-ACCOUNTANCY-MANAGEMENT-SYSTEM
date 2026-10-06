import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchClients } from "../services/clientService";
import { fetchProducts } from "../services/productService";
import { createPurchase } from "../services/purchaseService";
import { gradeService, sizeService } from "../services/attributeService";
import DateInput from "../components/DateInput";

const EMPTY_FORM = {
  supplierId: "",
  productId: "",
  grade: "",
  size: "",
  remarks: "",
  date: "",
  dateMode: "BS",
  invoiceNumber: "",
  quantity: "",
  rate: "",
  amountPaid: "",
  paymentMethod: "cash",
};

const PurchaseForm = () => {
  const [searchParams] = useSearchParams();
  const prefillProductId = searchParams.get("productId") || "";

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [grades, setGrades] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    productId: prefillProductId,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const prefillProduct = products.find((p) => p._id === prefillProductId);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        // Grade / size lists are optional extras — if they fail to load the
        // purchase can still be recorded, just without a variant.
        const [supplierResult, productResult, gradeResult, sizeResult] =
          await Promise.all([
            fetchClients("supplier"),
            fetchProducts(),
            gradeService.fetchAll().catch(() => ({ data: [] })),
            sizeService.fetchAll().catch(() => ({ data: [] })),
          ]);
        setSuppliers(supplierResult.data);
        setProducts(productResult.data);
        setGrades(gradeResult.data);
        setSizes(sizeResult.data);
      } catch (err) {
        setError("Couldn't load suppliers or products.");
      } finally {
        setLoading(false);
      }
    };

    loadOptions();
  }, []);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const quantity = Number(form.quantity) || 0;
  const rate = Number(form.rate) || 0;
  const total = quantity * rate;
  const amountPaid = Number(form.amountPaid) || 0;
  const dueAmount = total - amountPaid;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.supplierId) return setError("Please select a supplier.");
    if (!form.productId) return setError("Please select a product.");
    if (!form.invoiceNumber.trim())
      return setError("Invoice number is required.");
    if (!form.date) return setError("Please select a date.");
    if (quantity <= 0) return setError("Quantity must be greater than 0.");
    if (rate < 0) return setError("Rate cannot be negative.");
    if (amountPaid < 0) return setError("Amount paid cannot be negative.");
    if (amountPaid > total)
      return setError("Amount paid cannot exceed the total amount.");

    setSaving(true);
    try {
      await createPurchase({
        supplierId: form.supplierId,
        productId: form.productId,
        grade: form.grade,
        size: form.size,
        remarks: form.remarks,
        date: form.date,
        dateMode: form.dateMode,
        invoiceNumber: form.invoiceNumber,
        quantity,
        rate,
        amountPaid,
        paymentMethod: form.paymentMethod,
      });
      navigate("/dashboard/purchases", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save purchase.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <h1 className="page-title">New Purchase</h1>

      <form className="form-card" onSubmit={handleSubmit}>
        {prefillProductId && (
          <p className="page-subtitle" style={{ marginBottom: 16 }}>
            Stocking in{" "}
            <strong>
              {prefillProduct
                ? `${prefillProduct.name} (${prefillProduct.sku})`
                : "selected product"}
            </strong>
            . Fill in the supplier and purchase details below.
          </p>
        )}

        <div className="login-field">
          <label htmlFor="supplierId">Supplier</label>
          <select
            id="supplierId"
            value={form.supplierId}
            onChange={handleChange("supplierId")}
            required
          >
            <option value="">-- Select Supplier --</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="login-field">
          <label htmlFor="productId">Product</label>
          <select
            id="productId"
            value={form.productId}
            onChange={handleChange("productId")}
            disabled={Boolean(prefillProductId)}
            required
          >
            <option value="">-- Select Product --</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
          {prefillProductId && (
            <small className="field-hint">
              Auto-filled from Stock In.{" "}
              <button
                type="button"
                className="btn-link"
                onClick={() => navigate("/dashboard/purchases/new")}
              >
                Choose a different product
              </button>
            </small>
          )}
        </div>

        <div className="login-field">
          <label htmlFor="grade">Grade</label>
          <select
            id="grade"
            value={form.grade}
            onChange={handleChange("grade")}
          >
            <option value="">-- Select Grade --</option>
            {grades.map((g) => (
              <option key={g._id} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="login-field">
          <label htmlFor="size">Size</label>
          <select id="size" value={form.size} onChange={handleChange("size")}>
            <option value="">-- Select Size --</option>
            {sizes.map((s) => (
              <option key={s._id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <small className="field-hint">
            Grade and Size decide where this stock appears in Stock Summary —
            match them to what you pick when selling.
          </small>
        </div>

        <div className="login-field">
          <DateInput
            id="date"
            label="Date"
            value={form.date}
            onChange={(adIso) => setForm((prev) => ({ ...prev, date: adIso }))}
            mode={form.dateMode}
            onModeChange={(m) => setForm((prev) => ({ ...prev, dateMode: m }))}
          />
        </div>

        <div className="login-field">
          <label htmlFor="invoiceNumber">Invoice Number</label>
          <input
            id="invoiceNumber"
            type="text"
            value={form.invoiceNumber}
            onChange={handleChange("invoiceNumber")}
            required
          />
        </div>

        <div className="login-field">
          <label htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            type="number"
            min="1"
            value={form.quantity}
            onChange={handleChange("quantity")}
            required
          />
        </div>

        <div className="login-field">
          <label htmlFor="rate">Rate (per unit)</label>
          <input
            id="rate"
            type="number"
            min="0"
            step="0.01"
            value={form.rate}
            onChange={handleChange("rate")}
            required
          />
        </div>

        <div className="login-field">
          <label>Total</label>
          <input type="text" value={total.toLocaleString()} disabled />
        </div>

        <div className="login-field">
          <label htmlFor="amountPaid">Amount Paid</label>
          <input
            id="amountPaid"
            type="number"
            min="0"
            step="0.01"
            value={form.amountPaid}
            onChange={handleChange("amountPaid")}
          />
        </div>

        {amountPaid > 0 && (
          <div className="login-field">
            <label htmlFor="paymentMethod">Paid Via</label>
            <select
              id="paymentMethod"
              value={form.paymentMethod}
              onChange={handleChange("paymentMethod")}
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </div>
        )}

        <div className="login-field">
          <label>Due Amount</label>
          <input type="text" value={dueAmount.toLocaleString()} disabled />
        </div>

        <div className="login-field">
          <label htmlFor="remarks">Remarks</label>
          <input
            id="remarks"
            type="text"
            maxLength={300}
            placeholder="e.g. previous year stock"
            value={form.remarks}
            onChange={handleChange("remarks")}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Purchase"}
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() =>
              navigate(
                prefillProductId
                  ? `/dashboard/products/${prefillProductId}/stock`
                  : "/dashboard/purchases",
              )
            }
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default PurchaseForm;