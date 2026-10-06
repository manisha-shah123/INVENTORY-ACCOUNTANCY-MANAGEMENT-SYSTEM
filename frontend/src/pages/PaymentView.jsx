import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deletePayment, fetchPaymentById } from "../services/paymentService";
import { formatDateByMode } from "../utils/bsDate";

const PaymentView = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchPaymentById(id);
        setPayment(result.data);
      } catch (err) {
        setError("Couldn't load this payment.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Delete this payment? The invoice's due amount will be restored.",
    );
    if (!confirmed) return;

    try {
      await deletePayment(payment._id);
      navigate("/dashboard/hisab-kitab", { replace: true });
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to delete payment.");
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!payment) return null;

  const isSupplierPayment = payment.referenceModel === "Purchase";
  // Part of a lump-sum receipt: it's changed or removed via the receipt only.
  const belongsToReceipt = Boolean(payment.receipt);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payment — {payment.client?.name || "—"}</h1>
          <p className="page-subtitle">
            {formatDateByMode(payment.date, payment.dateMode)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-outline"
            onClick={() => navigate("/dashboard/hisab-kitab")}
          >
            Back to List
          </button>
          {belongsToReceipt ? (
            <button
              className="btn btn-primary"
              onClick={() =>
                navigate(`/dashboard/hisab-kitab/receipts/${payment.receipt._id}`)
              }
            >
              View Receipt
            </button>
          ) : (
            <>
              <button
                className="btn btn-outline"
                onClick={() => navigate(`/dashboard/hisab-kitab/${id}/edit`)}
              >
                Edit Payment
              </button>
              <button
                className="btn btn-outline btn-danger"
                onClick={handleDelete}
              >
                Delete Payment
              </button>
            </>
          )}
        </div>
      </div>

      <div className="form-card" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>Type:</span>
          <strong>
            <span className={isSupplierPayment ? "tag-out" : "tag-in"}>
              {isSupplierPayment ? "Paid to Supplier" : "Received from Customer"}
            </span>
          </strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>Client:</span>
          <strong>{payment.client?.name || "—"}</strong>
        </div>
        {belongsToReceipt && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span>Receipt:</span>
            <strong>
              <Link to={`/dashboard/hisab-kitab/receipts/${payment.receipt._id}`}>
                {payment.receipt.receiptNumber}
              </Link>
            </strong>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>Invoice #:</span>
          <strong>{payment.reference?.invoiceNumber || "—"}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>Date:</span>
          <strong>{formatDateByMode(payment.date, payment.dateMode)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>Amount:</span>
          <strong>{payment.amount.toLocaleString()}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, textTransform: "capitalize" }}>
          <span>Method:</span>
          <strong>{payment.method}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Remarks:</span>
          <strong>{payment.remarks || "—"}</strong>
        </div>
      </div>
    </div>
  );
};

export default PaymentView;
