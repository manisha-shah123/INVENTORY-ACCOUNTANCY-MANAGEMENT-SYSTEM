import { useEffect, useState } from "react";
import {
  fetchOpeningBalances,
  saveOpeningBalances,
} from "../../services/balanceSheetService";
import { formatMoney } from "../../utils/balanceFormat";

const FIELDS = [
  {
    key: "cash",
    label: "Cash in hand",
    hint: "Cash you had before you started recording in this system.",
  },
  {
    key: "bank",
    label: "Bank balance",
    hint: "Total balance across your bank accounts at that time.",
  },
  {
    key: "fixedAssets",
    label: "Fixed assets",
    hint: "Machinery, vehicles, furniture, computers... their value after depreciation.",
  },
  {
    key: "loans",
    label: "Loans",
    hint: "Money you had borrowed and not yet repaid at that time.",
  },
];

const EMPTY = { cash: "", bank: "", fixedAssets: "", loans: "" };

const toForm = (values) => {
  const form = { ...EMPTY };
  FIELDS.forEach(({ key }) => {
    const v = Number(values?.[key]) || 0;
    form[key] = v > 0 ? String(v) : "";
  });
  return form;
};

const OpeningBalances = ({ onSaved }) => {
  const [form, setForm] = useState(EMPTY);
  const [derived, setDerived] = useState(null);
  const [isSet, setIsSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await fetchOpeningBalances();
        if (cancelled) return;
        setForm(toForm(result.data.values));
        setDerived(result.data.derived);
        setIsSet(result.data.isSet);
      } catch (err) {
        if (!cancelled) setError("Couldn't load the opening balances.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (key) => (event) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const amount = (key) => Math.max(0, Number(form[key]) || 0);

  // Same sum the server uses: assets minus liabilities at the start.
  const capitalPreview = derived
    ? amount("cash") +
      amount("bank") +
      amount("fixedAssets") +
      derived.accountsReceivable +
      derived.inventory -
      derived.accountsPayable -
      amount("loans")
    : 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSaved(false);

    const payload = {};
    for (const { key, label } of FIELDS) {
      const raw = form[key].trim();
      const value = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(value)) return setError(`${label} must be a number.`);
      if (value < 0) return setError(`${label} cannot be negative.`);
      payload[key] = value;
    }

    setSaving(true);
    try {
      const result = await saveOpeningBalances(payload);
      setForm(toForm(result.data.values));
      setIsSet(true);
      setSaved(true);
      if (onSaved) onSaved();
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to save the opening balances.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="bs-panel">
      <p className="bs-panel-intro">
        These are the few starting figures the system cannot know by itself:
        what your business had <strong>before you began recording here</strong>.
        You only enter them once. Leave a box empty if it does not apply.
      </p>

      <form className="bs-card" onSubmit={handleSubmit}>
        {FIELDS.map(({ key, label, hint }) => (
          <div className="login-field" key={key}>
            <label htmlFor={`opening-${key}`}>{label}</label>
            <input
              id={`opening-${key}`}
              type="number"
              min="0"
              step="0.01"
              value={form[key]}
              onChange={handleChange(key)}
              placeholder="0"
            />
            <span className="bs-field-hint">{hint}</span>
          </div>
        ))}

        {error && <p className="error-text">{error}</p>}
        {saved && <p className="success-text">Opening balances saved.</p>}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : isSet ? "Update" : "Save"}
          </button>
        </div>
      </form>

      {derived && (
        <div className="bs-card bs-derived">
          <h3>Taken automatically from the rest of the system</h3>
          <dl>
            <div>
              <dt>Customers owed you (customers' Previous Due)</dt>
              <dd>{formatMoney(derived.accountsReceivable)}</dd>
            </div>
            <div>
              <dt>You owed suppliers (suppliers' Previous Due)</dt>
              <dd>{formatMoney(derived.accountsPayable)}</dd>
            </div>
            <div>
              <dt>Opening stock (products' opening stock × purchase price)</dt>
              <dd>{formatMoney(derived.inventory)}</dd>
            </div>
            <div className="bs-derived-total">
              <dt>Owner's capital at the start (assets − liabilities)</dt>
              <dd>{formatMoney(capitalPreview)}</dd>
            </div>
          </dl>
          <p className="bs-field-hint">
            Owner's capital is calculated for you, so the balance sheet always
            starts in balance.
          </p>
        </div>
      )}
    </div>
  );
};

export default OpeningBalances;
