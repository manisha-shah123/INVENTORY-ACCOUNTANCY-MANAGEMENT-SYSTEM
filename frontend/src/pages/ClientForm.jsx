import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchClientById,
  createClient,
  updateClient,
} from "../services/clientService";

const LABELS = {
  customer: { singular: "Customer", listPath: "customers" },
  supplier: { singular: "Supplier", listPath: "suppliers" },
};

const CUSTOMER_CATEGORIES = [
  { value: "normal", label: "Normal Customer" },
  { value: "distributor", label: "Distributor" },
  { value: "wholesaler", label: "Wholesaler" },
  { value: "retailer", label: "Retailer" },
];

const EMPTY_FORM = {
  name: "",
  city: "",
  address: "",
  email: "",
  phone: "",
  vatNumber: "",
  customerCategory: "normal",
  country: "",
  openingDue: "0",
};

const validateForm = (form) => {
  if (!/[A-Za-z]/.test(form.name.trim())) {
    return "Name must contain letters, not just numbers.";
  }
  if (form.phone && !/^\d{10}$/.test(form.phone)) {
    return "Phone number must be exactly 10 digits.";
  }
  if (form.vatNumber && !/^\d{9}$/.test(form.vatNumber)) {
    return "VAT number must be exactly 9 digits.";
  }
  if (form.openingDue !== "" && (!Number.isFinite(Number(form.openingDue)) || Number(form.openingDue) < 0)) {
    return "Previous due cannot be negative.";
  }
  return "";
};

const ClientForm = ({ type }) => {
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const labels = LABELS[type];

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    if (!isEditMode) return;

    const loadClient = async () => {
      try {
        const result = await fetchClientById(id);
        const client = result.data;
        setForm({
          name: client.name || "",
          city: client.city || "",
          address: client.address || "",
          email: client.email || "",
          phone: client.phone || "",
          vatNumber: client.vatNumber || "",
          customerCategory: client.customerCategory || "normal",
          country: client.country || "",
          openingDue: String(client.openingDue ?? 0),
        });
      } catch (err) {
        setError(`Couldn't load this ${labels.singular.toLowerCase()}.`);
      } finally {
        setLoading(false);
      }
    };

    loadClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleDigitsChange = (field, maxLength) => (event) => {
    const digitsOnly = event.target.value
      .replace(/\D/g, "")
      .slice(0, maxLength);
    setForm((prev) => ({ ...prev, [field]: digitsOnly }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      if (isEditMode) {
        await updateClient(id, { ...form, type });
      } else {
        await createClient({ ...form, type });
      }
      navigate(`/dashboard/${labels.listPath}`, { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Failed to save ${labels.singular.toLowerCase()}.`,
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <h1 className="page-title">
        {isEditMode ? `Edit ${labels.singular}` : `Add New ${labels.singular}`}
      </h1>

      <form className="form-card" onSubmit={handleSubmit}>
        <div className="login-field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={handleChange("name")}
            required
          />
        </div>

        {type === "customer" && (
          <div className="login-field">
            <label htmlFor="customerCategory">Customer Type</label>
            <select
              id="customerCategory"
              value={form.customerCategory}
              onChange={handleChange("customerCategory")}
            >
              {CUSTOMER_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === "supplier" && (
          <div className="login-field">
            <label htmlFor="country">Country</label>
            <input
              id="country"
              type="text"
              placeholder="e.g. China, India, Nepal"
              value={form.country}
              onChange={handleChange("country")}
            />
          </div>
        )}

        <div className="login-field">
          <label htmlFor="city">City</label>
          <input
            id="city"
            type="text"
            placeholder="e.g. Kathmandu, Pokhara"
            value={form.city}
            onChange={handleChange("city")}
          />
        </div>

        <div className="login-field">
          <label htmlFor="address">Address</label>
          <input
            id="address"
            type="text"
            value={form.address}
            onChange={handleChange("address")}
          />
        </div>

        <div className="login-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={handleChange("email")}
          />
        </div>

        <div className="login-field">
          <label htmlFor="phone">Phone</label>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="10 digit phone number"
            value={form.phone}
            onChange={handleDigitsChange("phone", 10)}
          />
        </div>

        <div className="login-field">
          <label htmlFor="vatNumber">VAT Number</label>
          <input
            id="vatNumber"
            type="text"
            inputMode="numeric"
            maxLength={9}
            placeholder="9 digit VAT number"
            value={form.vatNumber}
            onChange={handleDigitsChange("vatNumber", 9)}
          />
        </div>

        {(type === "customer" || type === "supplier") && (
          <div className="login-field">
            <label htmlFor="openingDue">Previous Due (Rs)</label>
            <input
              id="openingDue"
              type="number"
              min="0"
              step="0.01"
              placeholder="Balance carried over before this system, if any"
              value={form.openingDue}
              onChange={handleChange("openingDue")}
            />
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => navigate(`/dashboard/${labels.listPath}`)}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default ClientForm;
