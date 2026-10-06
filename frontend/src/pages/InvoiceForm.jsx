import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchClients } from "../services/clientService";
import { fetchProducts } from "../services/productService";
import {
  createInvoice,
  fetchInvoiceById,
  updateInvoice,
} from "../services/invoiceService";
import { gradeService, sizeService } from "../services/attributeService";
import DateInput from "../components/DateInput";

const VAT_RATE = 0.13;

const EMPTY_LINE = {
  productId: "",
  hsCode: "",
  grade: "",
  size: "",
  quantity: "",
  rate: "",
};

const InvoiceForm = () => {
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [grades, setGrades] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState("");
  const [dateMode, setDateMode] = useState("BS");
  const [paymentMode, setPaymentMode] = useState("cash");

  const [customerId, setCustomerId] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");

  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [remarks, setRemarks] = useState("");
  const [discount, setDiscount] = useState("0");
  const [amountReceived, setAmountReceived] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [customerResult, productResult, gradeResult, sizeResult] =
          await Promise.all([
            fetchClients("customer"),
            fetchProducts(),
            gradeService.fetchAll(),
            sizeService.fetchAll(),
          ]);
        setCustomers(customerResult.data);
        setProducts(productResult.data);
        setGrades(gradeResult.data);
        setSizes(sizeResult.data);

        if (isEditMode) {
          const invoiceResult = await fetchInvoiceById(id);
          const invoice = invoiceResult.data;

          setInvoiceNumber(invoice.invoiceNumber || "");
          setDate(invoice.date || "");
          setDateMode(invoice.dateMode || "BS");
          setPaymentMode(invoice.paymentMode || "cash");
          setCustomerId(invoice.customer?._id || "");
          setBuyerName(invoice.buyerName || "");
          setVatNumber(invoice.vatNumber || "");
          setAddress(invoice.address || "");
          setContactNumber(invoice.contactNumber || "");
          setRemarks(invoice.remarks || "");
          setDiscount(String(invoice.discount ?? "0"));
          setAmountReceived(String(invoice.amountReceived ?? ""));
          setLines(
            (invoice.items || []).map((item) => ({
              productId: item.product?._id || "",
              hsCode: item.hsCode || "",
              grade: item.grade || "",
              size: item.size || "",
              quantity: String(item.quantity ?? ""),
              rate: String(item.rate ?? ""),
            })),
          );
        }
      } catch (err) {
        setError(
          isEditMode
            ? "Couldn't load the invoice for editing."
            : "Couldn't load customers or products.",
        );
      } finally {
        setLoading(false);
      }
    };
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleClientSelect = (event) => {
    const clientId = event.target.value;
    setCustomerId(clientId);
    const client = customers.find((c) => c._id === clientId);
    if (client) {
      setBuyerName(client.name || "");
      setVatNumber(client.vatNumber || "");
      setAddress(client.address || "");
      setContactNumber(client.phone || "");
    }
  };

  const updateLine = (index, field, value) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // HS Code is fixed per product (set once on the product record), so it is
  // always derived from the chosen product rather than picked independently.
  const handleLineProductSelect = (index, productId) => {
    const product = products.find((p) => p._id === productId);
    setLines((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        productId,
        hsCode: product?.hsCode || "",
      };
      return next;
    });
  };

  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (index) =>
    setLines((prev) => prev.filter((_, i) => i !== index));

  const lineAmount = (line) =>
    (Number(line.quantity) || 0) * (Number(line.rate) || 0);
  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const discountNum = Number(discount) || 0;
  const taxableAmount = Math.max(subtotal - discountNum, 0);
  const vatAmount = taxableAmount * VAT_RATE;
  const grandTotal = taxableAmount + vatAmount;
  const receivedNum = Number(amountReceived) || 0;
  const dueAmount = grandTotal - receivedNum;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!invoiceNumber.trim()) return setError("Invoice number is required.");
    if (!customerId) return setError("Please select a client.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return setError("Please select a date.");
    if (lines.length === 0) return setError("Add at least one item.");

    for (const line of lines) {
      if (!line.productId)
        return setError("Every item needs a product selected.");
      const qty = Number(line.quantity);
      const rate = Number(line.rate);
      if (!qty || qty <= 0)
        return setError("Every item needs a quantity greater than 0.");
      if (rate < 0) return setError("Rate cannot be negative.");
      const product = products.find((p) => p._id === line.productId);
      if (product && rate < product.purchasePrice) {
        return setError(
          `Rate for ${product.name} cannot be less than its purchase price (${product.purchasePrice}).`,
        );
      }
    }

    if (discountNum < 0) return setError("Discount cannot be negative.");
    if (discountNum > subtotal)
      return setError("Discount cannot exceed the subtotal.");
    if (receivedNum < 0) return setError("Amount received cannot be negative.");
    if (receivedNum > grandTotal)
      return setError("Amount received cannot exceed the grand total.");

    const payload = {
      invoiceNumber,
      customerId,
      buyerName,
      vatNumber,
      address,
      contactNumber,
      date,
      dateMode,
      paymentMode,
      items: lines.map((l) => ({
        productId: l.productId,
        hsCode: l.hsCode,
        grade: l.grade,
        size: l.size,
        quantity: Number(l.quantity),
        rate: Number(l.rate),
      })),
      remarks,
      discount: discountNum,
      amountReceived: receivedNum,
    };

    setSaving(true);
    try {
      if (isEditMode) {
        await updateInvoice(id, payload);
        navigate(`/dashboard/sales/${id}`, { replace: true });
      } else {
        const result = await createInvoice(payload);
        navigate(`/dashboard/sales/${result.data._id}`, { replace: true });
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (isEditMode
            ? "Failed to update invoice."
            : "Failed to create invoice."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1 className="page-title">
        {isEditMode ? "Edit VAT Invoice" : "Create VAT Invoice"}
      </h1>

      <form onSubmit={handleSubmit}>
        <div
          className="form-card"
          style={{ maxWidth: "100%", marginBottom: 20 }}
        >
          <h3 style={{ marginTop: 0 }}>Invoice Information</h3>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div className="login-field" style={{ flex: 1, minWidth: 200 }}>
              <label>Invoice Number</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                required
              />
            </div>
            <div className="login-field" style={{ flex: 1, minWidth: 200 }}>
              <DateInput
                id="date"
                label="Date"
                value={date}
                onChange={setDate}
                mode={dateMode}
                onModeChange={setDateMode}
              />
            </div>
            <div className="login-field" style={{ flex: 1, minWidth: 200 }}>
              <label>Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="credit">Credit</option>
                <option value="bank">Bank</option>
              </select>
            </div>
          </div>
        </div>

        <div
          className="form-card"
          style={{ maxWidth: "100%", marginBottom: 20 }}
        >
          <h3 style={{ marginTop: 0 }}>Client Information</h3>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div className="login-field" style={{ flex: 1, minWidth: 220 }}>
              <label>Client</label>
              <select value={customerId} onChange={handleClientSelect} required>
                <option value="">-- Select Client --</option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="login-field" style={{ flex: 1, minWidth: 220 }}>
              <label>Buyer Name</label>
              <input
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
            </div>
            <div className="login-field" style={{ flex: 1, minWidth: 220 }}>
              <label>VAT Number</label>
              <input
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
              />
            </div>
            <div className="login-field" style={{ flex: 1, minWidth: 220 }}>
              <label>Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="login-field" style={{ flex: 1, minWidth: 220 }}>
              <label>Contact Number</label>
              <input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
              />
            </div>
          </div>
          <p className="field-hint">
            Fields auto-fill from the selected client — edit if this invoice's
            buyer differs.
          </p>
        </div>

        <div
          className="form-card"
          style={{ maxWidth: "100%", marginBottom: 20 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Invoice Items</h3>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={addLine}
            >
              + Add Item
            </button>
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
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>
                      <select
                        value={line.productId}
                        onChange={(e) =>
                          handleLineProductSelect(index, e.target.value)
                        }
                        required
                      >
                        <option value="">-- Select --</option>
                        {products.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={line.hsCode || "—"}
                        readOnly
                        disabled
                        title="HS Code is fixed on the product and can't be edited here"
                      />
                    </td>
                    <td>
                      <select
                        value={line.grade}
                        onChange={(e) =>
                          updateLine(index, "grade", e.target.value)
                        }
                      >
                        <option value="">-- Select --</option>
                        {grades.map((g) => (
                          <option key={g._id} value={g.name}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={line.size}
                        onChange={(e) =>
                          updateLine(index, "size", e.target.value)
                        }
                      >
                        <option value="">-- Select --</option>
                        {sizes.map((s) => (
                          <option key={s._id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(index, "quantity", e.target.value)
                        }
                        required
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.rate}
                        onChange={(e) =>
                          updateLine(index, "rate", e.target.value)
                        }
                        required
                      />
                    </td>
                    <td>{lineAmount(line).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-danger"
                        onClick={() => removeLine(index)}
                        disabled={lines.length === 1}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div className="form-card" style={{ flex: 1, minWidth: 280 }}>
            <label htmlFor="remarks">Remarks</label>
            <textarea
              id="remarks"
              rows={4}
              style={{ width: "100%", marginTop: 8 }}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div className="form-card" style={{ flex: 1, minWidth: 280 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span>Subtotal:</span>
              <strong>{subtotal.toLocaleString()}</strong>
            </div>
            <div className="login-field">
              <label>Discount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span>Taxable Amount:</span>
              <strong>{taxableAmount.toLocaleString()}</strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span>VAT (13%):</span>
              <strong>{vatAmount.toLocaleString()}</strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 16,
                fontSize: 18,
              }}
            >
              <strong>Grand Total:</strong>
              <strong>{grandTotal.toLocaleString()}</strong>
            </div>
            <div className="login-field">
              <label>Amount Received</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Due Amount:</span>
              <strong>{dueAmount.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : isEditMode
                ? "Update Invoice"
                : "Save Invoice"}
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() =>
              navigate(
                isEditMode ? `/dashboard/sales/${id}` : "/dashboard/sales",
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

export default InvoiceForm;