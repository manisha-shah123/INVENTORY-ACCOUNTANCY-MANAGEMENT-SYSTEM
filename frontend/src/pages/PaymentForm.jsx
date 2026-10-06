import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchClients } from "../services/clientService";
import {
  fetchPendingInvoices,
  fetchPaymentById,
  createPayment,
  updatePayment,
} from "../services/paymentService";
import DateInput from "../components/DateInput";

const EMPTY_FORM = {
  type: "purchase",
  clientId: "",
  invoiceId: "",
  date: "",
  dateMode: "BS",
  amount: "",
  method: "cash",
  remarks: "",
};

const PaymentForm = () => {
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [form, setForm] = useState(EMPTY_FORM);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Holds the invoice/purchase doc the payment currently points to (from populate),
  // so it can still be shown as an option even if its due amount is now 0.
  const [currentInvoiceOption, setCurrentInvoiceOption] = useState(null);
  // Remembers the payment's original invoice + amount so the due-amount check
  // can account for the amount this payment already contributed.
  const [originalPayment, setOriginalPayment] = useState(null);

  const skipResetRef = useRef(false);
  const navigate = useNavigate();

  // Edit mode: load the existing payment first
  useEffect(() => {
    if (!isEditMode) return;

    const loadPayment = async () => {
      setLoadingPayment(true);
      setError("");
      try {
        const result = await fetchPaymentById(id);
        const payment = result.data;

        skipResetRef.current = true;
        setForm({
          type: payment.referenceModel === "Purchase" ? "purchase" : "invoice",
          clientId: payment.client?._id || "",
          invoiceId: payment.reference?._id || "",
          date: payment.date || "",
          dateMode: payment.dateMode || "BS",
          amount: String(payment.amount ?? ""),
          method: payment.method || "cash",
          remarks: payment.remarks || "",
        });
        setCurrentInvoiceOption(payment.reference || null);
        setOriginalPayment({
          invoiceId: payment.reference?._id || "",
          amount: Number(payment.amount) || 0,
        });
      } catch (err) {
        setError("Couldn't load this payment for editing.");
      } finally {
        setLoadingPayment(false);
      }
    };
    loadPayment();
  }, [id, isEditMode]);

  useEffect(() => {
    const loadClients = async () => {
      setLoadingClients(true);
      try {
        const result = await fetchClients(
          form.type === "purchase" ? "supplier" : "customer",
        );
        setClients(result.data);
      } catch (err) {
        setError("Couldn't load clients.");
      } finally {
        setLoadingClients(false);
      }
    };
    loadClients();

    if (skipResetRef.current) {
      // This run was triggered by loading the existing payment's data in edit
      // mode — don't wipe the clientId/invoiceId we just set.
      skipResetRef.current = false;
    } else {
      setForm((prev) => ({ ...prev, clientId: "", invoiceId: "" }));
      setInvoices([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type]);

  useEffect(() => {
    if (!form.clientId) {
      setInvoices([]);
      return;
    }

    const loadInvoices = async () => {
      setLoadingInvoices(true);
      try {
        const result = await fetchPendingInvoices(form.type, form.clientId);
        let list = result.data;

        // Make sure the invoice this payment already applies to stays selectable,
        // even if its due amount is now 0 because of this very payment.
        if (
          currentInvoiceOption &&
          form.invoiceId === currentInvoiceOption._id &&
          !list.some((inv) => inv._id === currentInvoiceOption._id)
        ) {
          list = [...list, currentInvoiceOption];
        }

        setInvoices(list);
      } catch (err) {
        setError("Couldn't load invoices for this client.");
      } finally {
        setLoadingInvoices(false);
      }
    };
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.clientId, currentInvoiceOption]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const selectedInvoice = invoices.find((inv) => inv._id === form.invoiceId);

  // Effective due amount available to this payment: the invoice's current due,
  // plus whatever this same payment already contributed (since that will be
  // reversed and re-applied on save).
  const effectiveDue = selectedInvoice
    ? selectedInvoice.dueAmount +
      (isEditMode &&
      originalPayment &&
      originalPayment.invoiceId === selectedInvoice._id
        ? originalPayment.amount
        : 0)
    : 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.clientId) return setError("Please select a client.");
    if (!form.invoiceId) return setError("Please select an invoice.");
    if (!form.date) return setError("Please select a date.");
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return setError("Amount must be greater than 0.");
    if (selectedInvoice && amt > effectiveDue) {
      return setError(
        `Amount cannot exceed the due amount (${effectiveDue}).`,
      );
    }

    const payload = {
      type: form.type,
      invoiceId: form.invoiceId,
      clientId: form.clientId,
      date: form.date,
      dateMode: form.dateMode,
      amount: amt,
      method: form.method,
      remarks: form.remarks,
    };

    setSaving(true);
    try {
      if (isEditMode) {
        await updatePayment(id, payload);
        navigate(`/dashboard/hisab-kitab/${id}`, { replace: true });
      } else {
        const result = await createPayment(payload);
        navigate(`/dashboard/hisab-kitab/${result.data._id}`, {
          replace: true,
        });
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (isEditMode
            ? "Failed to update payment."
            : "Failed to record payment."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loadingPayment) return <p>Loading...</p>;

  return (
    <div>
      <h1 className="page-title">
        {isEditMode ? "Edit Payment" : "Pay Supplier"}
      </h1>
      {!isEditMode && (
        <p className="page-subtitle">
          To record money received from a customer, use{" "}
          <button
            type="button"
            className="btn-link"
            onClick={() => navigate("/dashboard/hisab-kitab/receive")}
          >
            Receive Payment
          </button>
          .
        </p>
      )}

      <form className="form-card" onSubmit={handleSubmit}>
        {/* New customer payments go through "Receive Payment" (lump sum across
            invoices). The type is only selectable when editing an old,
            single-invoice payment. */}
        {isEditMode && (
          <div className="login-field">
            <label htmlFor="type">Type</label>
            <select id="type" value={form.type} onChange={handleChange("type")}>
              <option value="purchase">Payment to Supplier</option>
              <option value="invoice">Payment from Customer</option>
            </select>
          </div>
        )}

        <div className="login-field">
          <label htmlFor="clientId">
            {form.type === "purchase" ? "Supplier" : "Customer"}
          </label>
          <select
            id="clientId"
            value={form.clientId}
            onChange={handleChange("clientId")}
            disabled={loadingClients}
            required
          >
            <option value="">
              -- Select {form.type === "purchase" ? "Supplier" : "Customer"} --
            </option>
            {clients.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="login-field">
          <label htmlFor="invoiceId">Invoice</label>
          <select
            id="invoiceId"
            value={form.invoiceId}
            onChange={handleChange("invoiceId")}
            disabled={!form.clientId || loadingInvoices}
            required
          >
            <option value="">
              {!form.clientId
                ? "-- Select a client first --"
                : loadingInvoices
                  ? "Loading..."
                  : "-- Select Invoice --"}
            </option>
            {invoices.map((inv) => (
              <option key={inv._id} value={inv._id}>
                Inv #{inv.invoiceNumber} — Due: {inv.dueAmount.toLocaleString()}
              </option>
            ))}
          </select>
          {form.clientId && !loadingInvoices && invoices.length === 0 && (
            <p className="field-hint">
              No outstanding invoices for this client.
            </p>
          )}
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
          <label htmlFor="amount">Amount</label>
          <input
            id="amount"
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={handleChange("amount")}
            required
          />
          {selectedInvoice && (
            <p className="field-hint">
              Due on this invoice: {effectiveDue.toLocaleString()}
            </p>
          )}
        </div>

        <div className="login-field">
          <label htmlFor="method">Method</label>
          <select
            id="method"
            value={form.method}
            onChange={handleChange("method")}
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
          </select>
        </div>

        <div className="login-field">
          <label htmlFor="remarks">Remarks</label>
          <input
            id="remarks"
            type="text"
            value={form.remarks}
            onChange={handleChange("remarks")}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : isEditMode
                ? "Update Payment"
                : "Save Payment"}
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() =>
              navigate(
                isEditMode
                  ? `/dashboard/hisab-kitab/${id}`
                  : "/dashboard/hisab-kitab",
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

export default PaymentForm;
