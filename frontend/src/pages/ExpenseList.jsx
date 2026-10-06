import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchExpenses, deleteExpense } from "../services/expenseService";
import { formatDateByMode } from "../utils/bsDate";

const ExpenseList = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const loadExpenses = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchExpenses();
      setExpenses(result.data);
    } catch (err) {
      setError("Couldn't load expenses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  const handleDelete = async (expense) => {
    const confirmed = window.confirm(
      `Delete this ${expense.category} expense of ${expense.amount}?`,
    );
    if (!confirmed) return;

    try {
      await deleteExpense(expense._id);
      setExpenses((prev) => prev.filter((e) => e._id !== expense._id));
    } catch (err) {
      window.alert("Failed to delete expense.");
    }
  };

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expense</h1>
          <p className="page-subtitle">Track business expenses by category.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/dashboard/expenses/new")}
        >
          + New Expense
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && expenses.length === 0 && (
        <p className="page-subtitle">No expenses recorded yet.</p>
      )}

      {!loading && !error && expenses.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th className="table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense._id}>
                  <td>{formatDateByMode(expense.date, expense.dateMode)}</td>
                  <td>{expense.category}</td>
                  <td>{expense.description || "—"}</td>
                  <td>{expense.amount.toLocaleString()}</td>
                  <td className="table-actions-col">
                    <div className="table-actions">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() =>
                          navigate(`/dashboard/expenses/${expense._id}`)
                        }
                      >
                        View
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() =>
                          navigate(`/dashboard/expenses/${expense._id}/edit`)
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-outline btn-sm btn-danger"
                        onClick={() => handleDelete(expense)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 700, textAlign: "right" }}>
                  Total
                </td>
                <td style={{ fontWeight: 700 }}>{total.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExpenseList;
