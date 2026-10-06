import { useCallback, useEffect, useState } from "react";
import DateInput from "../DateInput";
import {
  createEntry,
  deleteEntry,
  fetchEntries,
  fetchEntryTypes,
  updateEntry,
} from "../../services/balanceSheetService";
import { formatDateByMode, todayAdIso } from "../../utils/bsDate";
import { formatMoney } from "../../utils/balanceFormat";

const makeEmptyForm = (type = "") => ({
  type,
  date: todayAdIso(),
  dateMode: "BS",
  amount: "",
  method: "cash",
  note: "",
});

const effectText = (direction) => {
  if (direction === "in") return "Money in";
  if (direction === "out") return "Money out";
  return "No money moves";
};

const OtherEntries = ({ onChanged }) => {
  const [types, setTypes] = useState([]);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(makeEmptyForm());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadEntries = useCallback(async () => {
    const result = await fetchEntries();
    setEntries(result.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [typesResult, entriesResult] = await Promise.all([
          fetchEntryTypes(),
          fetchEntries(),
        ]);
        if (cancelled) return;
        setTypes(typesResult.data);
        setEntries(entriesResult.data);
        setForm((prev) =>
          prev.type ? prev : makeEmptyForm(typesResult.data[0]?.value || ""),
        );
      } catch (err) {
        if (!cancelled) setError("Couldn't load the entries.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const typeInfo = (value) => types.find((t) => t.value === value);
  const selected = typeInfo(form.type);
  const needsMethod = Boolean(selected && selected.direction);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(makeEmptyForm(form.type || types[0]?.value || ""));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.type) return setError("Please choose what happened.");
    if (!form.date) return setError("Please select a date.");
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return setError("Amount must be greater than 0.");
    }

    const payload = {
      type: form.type,
      date: form.date,
      dateMode: form.dateMode,
      amount: amt,
      note: form.note,
    };
    if (needsMethod) payload.method = form.method;

    setSaving(true);
    try {
      if (editingId) await updateEntry(editingId, payload);
      else await createEntry(payload);
      await loadEntries();
      resetForm();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save the entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (entry) => {
    setError("");
    setEditingId(entry._id);
    setForm({
      type: entry.type,
      date: entry.date,
      dateMode: entry.dateMode || "BS",
      amount: String(entry.amount),
      method: entry.method === "bank" ? "bank" : "cash",
      note: entry.note || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (entry) => {
    const label = typeInfo(entry.type)?.label || "this entry";
    if (!window.confirm(`Delete "${label}" (${formatMoney(entry.amount)})?`)) {
      return;
    }
    setError("");
    try {
      await deleteEntry(entry._id);
      if (editingId === entry._id) resetForm();
      await loadEntries();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete the entry.");
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="bs-panel">
      <p className="bs-panel-intro">
        Sales, purchases, payments and expenses already reach the balance sheet
        by themselves. Use this page <strong>only</strong> for the few things
        the rest of the system does not record: money the owner puts in or
        takes out, loans, fixed assets, depreciation, VAT paid to the
        government, and dues from before you started using this system.
      </p>

      <form className="bs-card" onSubmit={handleSubmit}>
        <h3>{editingId ? "Edit entry" : "Add an entry"}</h3>

        <div className="login-field">
          <label htmlFor="entry-type">What happened?</label>
          <select
            id="entry-type"
            value={form.type}
            onChange={handleChange("type")}
          >
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {selected && <span className="bs-field-hint">{selected.help}</span>}
        </div>

        <div className="login-field">
          <DateInput
            id="entry-date"
            label="Date"
            value={form.date}
            onChange={(adIso) => setForm((prev) => ({ ...prev, date: adIso }))}
            mode={form.dateMode}
            onModeChange={(m) => setForm((prev) => ({ ...prev, dateMode: m }))}
          />
        </div>

        <div className="login-field">
          <label htmlFor="entry-amount">Amount</label>
          <input
            id="entry-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={handleChange("amount")}
          />
        </div>

        {needsMethod && (
          <div className="login-field">
            <label htmlFor="entry-method">
              {selected.direction === "in" ? "Received in" : "Paid from"}
            </label>
            <select
              id="entry-method"
              value={form.method}
              onChange={handleChange("method")}
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </div>
        )}

        <div className="login-field">
          <label htmlFor="entry-note">Note (optional)</label>
          <input
            id="entry-note"
            type="text"
            maxLength={300}
            value={form.note}
            onChange={handleChange("note")}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update Entry" : "Add Entry"}
          </button>
          {editingId && (
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setError("");
                resetForm();
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <h3 className="bs-list-title">Entries</h3>
      {entries.length === 0 ? (
        <p className="page-subtitle">No entries yet.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>What happened</th>
                <th>Effect</th>
                <th className="num">Amount</th>
                <th>Note</th>
                <th className="table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const info = typeInfo(entry.type);
                return (
                  <tr key={entry._id}>
                    <td className="nowrap">
                      {formatDateByMode(entry.date, entry.dateMode)}
                    </td>
                    <td>{info ? info.label : entry.type}</td>
                    <td>
                      {effectText(info?.direction)}
                      {info?.direction && entry.method
                        ? ` (${entry.method === "bank" ? "Bank" : "Cash"})`
                        : ""}
                    </td>
                    <td className="num">{formatMoney(entry.amount)}</td>
                    <td>{entry.note || "—"}</td>
                    <td className="table-actions-col">
                      <div className="table-actions">
                        <button
                          className="btn btn-outline btn-sm"
                          type="button"
                          onClick={() => handleEdit(entry)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-outline btn-sm btn-danger"
                          type="button"
                          onClick={() => handleDelete(entry)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default OtherEntries;
