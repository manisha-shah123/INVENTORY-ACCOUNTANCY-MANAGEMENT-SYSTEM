import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteExpense, fetchExpenseById } from "../services/expenseService";
import { formatDateByMode } from "../utils/bsDate";

const ExpenseView = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchExpenseById(id);
        setExpense(result.data);
      } catch (err) {
        setError("Couldn't load this expense.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Delete this ${expense.category} expense of ${expense.amount}?`,
    );
    if (!confirmed) return;

    try {
      await deleteExpense(expense._id);
      navigate("/dashboard/expenses", { replace: true });
    } catch (err) {
      window.alert("Failed to delete expense.");
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!expense) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expense — {expense.category}</h1>
          <p className="page-subtitle">
            {formatDateByMode(expense.date, expense.dateMode)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-outline"
            onClick={() => navigate("/dashboard/expenses")}
          >
            Back to List
          </button>
          <button
            className="btn btn-outline"
            onClick={() => navigate(`/dashboard/expenses/${id}/edit`)}
          >
            Edit Expense
          </button>
          <button className="btn btn-outline btn-danger" onClick={handleDelete}>
            Delete Expense
          </button>
        </div>
      </div>

      <div className="form-card" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>Category:</span>
          <strong>{expense.category}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>Date:</span>
          <strong>{formatDateByMode(expense.date, expense.dateMode)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>Amount:</span>
          <strong>{expense.amount.toLocaleString()}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Description:</span>
          <strong>{expense.description || "—"}</strong>
        </div>
      </div>
    </div>
  );
};

export default ExpenseView;
