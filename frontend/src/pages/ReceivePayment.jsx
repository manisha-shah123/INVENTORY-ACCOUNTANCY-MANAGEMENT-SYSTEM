import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fetchClients } from "../services/clientService";
import {
  fetchCustomerSummary,
  fetchReceiptById,
  createReceipt,
  updateReceipt,
} from "../services/receiptService";
import DateInput from "../components/DateInput";
import { formatDateByMode, todayAdIso } from "../utils/bsDate";
import { allocateFIFO, formatAmount, round2 } from "../utils/receipts";

const RECENT_PAYMENT_COUNT = 5;

const ReceivePayment = () => {
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Edit mode: the receipt being edited.
  const [original, setOriginal] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(isEditMode);

  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [customerId, setCustomerId] = useState(
    searchParams.get("customer") || "",
  );

  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  // Bumped to force a reload of the summary (e.g. after a save conflict).
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState({
    date: todayAdIso(),
    dateMode: "BS",
    amount: "",
    method: "cash",
    remarks: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Edit mode: load the receipt first, then the customer's account follows.
  useEffect(() => {
    if (!isEditMode) return;

    const loadReceipt = async () => {
      try {
        const result = await fetchReceiptById(id);
        const receipt = result.data;
        setOriginal(receipt);
        setCustomerId(receipt.customer?._id || "");
        setForm({
          date: receipt.date,
          dateMode: receipt.dateMode || "BS",
          amount: String(receipt.amount),
          method: receipt.method,
          remarks: receipt.remarks || "",
        });
      } catch (err) {
        setError("Couldn't load this receipt for editing.");
      } finally {
        setLoadingReceipt(false);
      }
    };
    loadReceipt();
  }, [id, isEditMode]);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const result = await fetchClients("customer");
        setCustomers(result.data);
      } catch (err) {
        setError("Couldn't load customers.");
      } finally {
        setLoadingCustomers(false);
      }
    };
    loadCustomers();
  }, []);

  // Selecting a customer loads their whole account automatically.
  useEffect(() => {
    if (!customerId) {
      setSummary(null);
      return;
    }

    let cancelled = false;
    const loadSummary = async () => {
      setLoadingSummary(true);
      try {
        const result = await fetchCustomerSummary(customerId);
        if (!cancelled) setSummary(result.data);
      } catch (err) {
        if (!cancelled) {
          setSummary(null);
          setError("Couldn't load this customer's account.");
        }
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    };
    loadSummary();

    return () => {
      cancelled = true;
    };
  }, [customerId, reloadKey]);

  const handleCustomerChange = (event) => {
    setCustomerId(event.target.value);
    setForm((prev) => ({ ...prev, amount: "" }));
    setError("");
  };

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  // When editing, show the account as it was BEFORE this receipt: give back
  // what the receipt paid on each invoice, and hide the receipt from the history.
  const givenBack = new Map(
    (isEditMode && original ? original.allocations : []).map((a) => [
      String(a.invoice),
      a.amount,
    ]),
  );
  const invoices = summary
    ? summary.invoices.map((inv) => {
        const back = givenBack.get(inv._id) || 0;
        return back
          ? {
              ...inv,
              dueAmount: round2(inv.dueAmount + back),
              amountReceived: round2(inv.amountReceived - back),
            }
          : inv;
      })
    : [];
  const openInvoices = invoices.filter((inv) => inv.dueAmount > 0);
  const totalDue = round2(invoices.reduce((t, inv) => t + inv.dueAmount, 0));
  const totalReceived = summary
    ? round2(
        summary.totals.totalReceived -
          (isEditMode && original ? original.amount : 0),
      )
    : 0;
  const historyRows = summary
    ? summary.history.filter(
        (h) => !(isEditMode && h.kind === "receipt" && h.id === original?._id),
      )
    : [];
  const recentHistory = historyRows.slice(0, RECENT_PAYMENT_COUNT);

  const amount = round2(form.amount);
  const amountIsValid = amount > 0 && amount <= totalDue;
  const plan = amountIsValid
    ? allocateFIFO(
        openInvoices.map((inv) => ({ id: inv._id, due: inv.dueAmount })),
        amount,
      )
    : [];
  const invoiceById = new Map(openInvoices.map((inv) => [inv._id, inv]));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!customerId) return setError("Please select a customer.");
    if (!summary || totalDue <= 0)
      return setError("This customer has no outstanding balance.");
    if (!form.date) return setError("Please select a date.");
    if (!(amount > 0)) return setError("Amount must be greater than 0.");
    if (amount > totalDue) {
      return setError(
        `Amount cannot exceed the total receivable (${formatAmount(totalDue)}).`,
      );
    }

    setSaving(true);
    try {
      const payload = {
        date: form.date,
        dateMode: form.dateMode,
        amount,
        method: form.method,
        remarks: form.remarks,
      };
      const result = isEditMode
        ? await updateReceipt(id, payload)
        : await createReceipt({ customerId, ...payload });
      navigate(`/dashboard/hisab-kitab/receipts/${result.data._id}`, {
        replace: true,
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (isEditMode ? "Failed to update receipt." : "Failed to record payment."),
      );
      // If the invoices changed underneath us, show the fresh numbers.
      if (err.response?.status === 409) setReloadKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  };

  if (loadingReceipt) return <p>Loading...</p>;

  return (
    <div>
      <h1 className="page-title">
        {isEditMode
          ? `Edit Receipt ${original?.receiptNumber || ""}`
          : "Receive Payment"}
      </h1>
      <p className="page-subtitle">
        {isEditMode
          ? "Change the amount, date, method or remarks. The payment is re-applied to the customer's unpaid invoices, oldest first."
          : "Money received from a customer is deducted from their total receivable — you don't need to pick an invoice. It settles the oldest unpaid invoices first."}
      </p>

      <form className="form-card payment-card" onSubmit={handleSubmit}>
        <div className="login-field">
          <label htmlFor="customerId">Customer</label>
          <select
            id="customerId"
            value={customerId}
            onChange={handleCustomerChange}
            disabled={loadingCustomers || isEditMode}
          >
            <option value="">-- Select Customer --</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          {!loadingCustomers && customers.length === 0 && (
            <p className="field-hint">
              No customers yet. Add one from the Customers page first.
            </p>
          )}
        </div>

        {loadingSummary && <p>Loading account...</p>}

        {summary && !loadingSummary && (
          <div className="account-summary">
            <div className="account-summary-head">
              <h3>{summary.customer.name}</h3>
              <Link to={`/dashboard/customers/${customerId}/statement`}>
                View full statement
              </Link>
            </div>

            {isEditMode && (
              <p className="field-hint">
                Balances below are shown as they were before this receipt was
                recorded, so you can change the amount freely.
              </p>
            )}

            <h4>Outstanding Invoices</h4>
            {openInvoices.length === 0 ? (
              <p className="field-hint">No unpaid invoices.</p>
            ) : (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Invoice #</th>
                    <th className="num">Total</th>
                    <th className="num">Received</th>
                    <th className="num">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {openInvoices.map((inv) => (
                    <tr key={inv._id}>
                      <td>{formatDateByMode(inv.date, inv.dateMode)}</td>
                      <td>{inv.invoiceNumber}</td>
                      <td className="num">{formatAmount(inv.grandTotal)}</td>
                      <td className="num">{formatAmount(inv.amountReceived)}</td>
                      <td className="num">{formatAmount(inv.dueAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="account-line">
              <span>Total Outstanding:</span>
              <strong>{formatAmount(totalDue)}</strong>
            </p>

            <hr className="account-divider" />

            <h4>Payments Made</h4>
            {recentHistory.length === 0 ? (
              <p className="field-hint">No payments received yet.</p>
            ) : (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentHistory.map((h) => (
                    <tr key={`${h.kind}-${h.id}`}>
                      <td>{formatDateByMode(h.date, h.dateMode)}</td>
                      <td>
                        {h.kind === "receipt"
                          ? h.receiptNumber
                          : h.kind === "at_sale"
                            ? `At invoice time (#${h.appliedTo[0]?.invoiceNumber})`
                            : `Payment (#${h.appliedTo[0]?.invoiceNumber})`}
                      </td>
                      <td className="num">{formatAmount(h.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="account-line">
              <span>Total Received (all time):</span>
              <strong>{formatAmount(totalReceived)}</strong>
            </p>

            <hr className="account-divider" />

            <p className="account-line">
              <span>Total Billed (all invoices):</span>
              <strong>{formatAmount(summary.totals.totalBilled)}</strong>
            </p>
            <p className="account-line account-due">
              <span>Due Amount:</span>
              <strong>{formatAmount(totalDue)}</strong>
            </p>
          </div>
        )}

        {summary && !loadingSummary && totalDue > 0 && (
          <>
            <div className="login-field">
              <DateInput
                id="date"
                label="Date"
                value={form.date}
                onChange={(adIso) =>
                  setForm((prev) => ({ ...prev, date: adIso }))
                }
                mode={form.dateMode}
                onModeChange={(m) =>
                  setForm((prev) => ({ ...prev, dateMode: m }))
                }
              />
            </div>

            <div className="login-field">
              <label htmlFor="amount">Amount</label>
              <div className="amount-row">
                <input
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={totalDue}
                  value={form.amount}
                  onChange={handleChange("amount")}
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, amount: String(totalDue) }))
                  }
                >
                  Pay full due
                </button>
              </div>
              <p className="field-hint">
                Total receivable: {formatAmount(totalDue)}
              </p>
            </div>

            {plan.length > 0 && (
              <div className="allocation-preview">
                <h4>How this payment will be applied</h4>
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th className="num">Due before</th>
                      <th className="num">Paying now</th>
                      <th className="num">Due after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map((line) => (
                      <tr key={line.id}>
                        <td>{invoiceById.get(line.id)?.invoiceNumber}</td>
                        <td className="num">{formatAmount(line.dueBefore)}</td>
                        <td className="num">{formatAmount(line.amount)}</td>
                        <td className="num">
                          {line.dueAfter === 0 ? (
                            <span className="tag-in">Cleared</span>
                          ) : (
                            formatAmount(line.dueAfter)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="account-line">
                  <span>Receivable remaining after this payment:</span>
                  <strong>{formatAmount(round2(totalDue - amount))}</strong>
                </p>
              </div>
            )}

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
          </>
        )}

        {summary && !loadingSummary && totalDue <= 0 && (
          <p className="field-hint">
            {summary.customer.name} has nothing outstanding — there is no
            payment to receive.
          </p>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button
            className="btn btn-primary"
            type="submit"
            disabled={saving || !summary || totalDue <= 0}
          >
            {saving
              ? "Saving..."
              : isEditMode
                ? "Update Receipt"
                : "Save Payment"}
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() =>
              navigate(
                isEditMode
                  ? `/dashboard/hisab-kitab/receipts/${id}`
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

export default ReceivePayment;
