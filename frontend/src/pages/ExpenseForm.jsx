import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createExpense,
  fetchExpenseById,
  updateExpense,
} from "../services/expenseService";
import DateInput from "../components/DateInput";

const CATEGORIES = [
  "Transport",
  "Salary",
  "Rent",
  "Fuel",
  "Office",
  "Marketing",
  "Other",
];

const EMPTY_FORM = {
  category: "Transport",
  date: "",
  dateMode: "BS",
  amount: "",
  description: "",
  paymentMethod: "cash",
};

const ExpenseForm = () => {
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    if (!isEditMode) return;

    const loadExpense = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchExpenseById(id);
        const expense = result.data;
        setForm({
          category: expense.category || "Transport",
          date: expense.date || "",
          dateMode: expense.dateMode || "BS",
          amount: String(expense.amount ?? ""),
          description: expense.description || "",
          paymentMethod: expense.paymentMethod === "bank" ? "bank" : "cash",
        });
      } catch (err) {
        setError("Couldn't load this expense for editing.");
      } finally {
        setLoading(false);
      }
    };
    loadExpense();
  }, [id, isEditMode]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.date) return setError("Please select a date.");
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return setError("Amount must be greater than 0.");

    const payload = {
      category: form.category,
      date: form.date,
      dateMode: form.dateMode,
      amount: amt,
      description: form.description,
      paymentMethod: form.paymentMethod,
    };

    setSaving(true);
    try {
      if (isEditMode) {
        await updateExpense(id, payload);
        navigate(`/dashboard/expenses/${id}`, { replace: true });
      } else {
        await createExpense(payload);
        navigate("/dashboard/expenses", { replace: true });
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (isEditMode ? "Failed to update expense." : "Failed to save expense."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1 className="page-title">
        {isEditMode ? "Edit Expense" : "New Expense"}
      </h1>

      <form className="form-card" onSubmit={handleSubmit}>
        <div className="login-field">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={form.category}
            onChange={handleChange("category")}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
        </div>

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

        <div className="login-field">
          <label htmlFor="description">Description</label>
          <input
            id="description"
            type="text"
            value={form.description}
            onChange={handleChange("description")}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : isEditMode
                ? "Update Expense"
                : "Save Expense"}
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() =>
              navigate(
                isEditMode
                  ? `/dashboard/expenses/${id}`
                  : "/dashboard/expenses",
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

export default ExpenseForm;
