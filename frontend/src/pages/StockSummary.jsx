import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchStockSummary } from "../services/stockSummaryService";
import {
  deletePurchase,
  updatePurchaseDetails,
} from "../services/purchaseService";
import { gradeService, sizeService } from "../services/attributeService";
import { adToBsSafe } from "../utils/bsDate";
import { formatAmount } from "../utils/receipts";
import "./StockSummary.css";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, "0");

// "2026-06-25" from a timestamp, using the browser's local date.
const localIsoFromDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Records store an AD date plus the calendar (AD/BS) the user entered it in.
// Show it the way it was entered, as YYYY-MM-DD, with a small AD/BS tag.
const DateCell = ({ adIso, mode }) => {
  if (!adIso) return <>—</>;
  if (mode === "AD") {
    return (
      <>
        {adIso}
        <span className="ss-date-tag">AD</span>
      </>
    );
  }
  const bs = adToBsSafe(adIso);
  return bs ? (
    <>
      {bs}
      <span className="ss-date-tag">BS</span>
    </>
  ) : (
    <>{adIso}</>
  );
};

// 480 -> "480", 12.5 -> "12.5"
const fmtQty = (n) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

// Round to 2 decimals (the trailing "+ 0" turns -0 into 0) — used when
// summing variant totals up into a product total.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100 + 0;

const groupLabel = (group) =>
  [group.productName, group.grade || "—", group.size || "—"].join(" / ");

const entryAdDate = (entry) =>
  entry.kind === "opening" ? localIsoFromDate(entry.createdAt) : entry.date;

// Keeps a value that's no longer in the master list selectable.
const withFallback = (list, currentValue) => {
  if (!currentValue) return list;
  return list.some((item) => item.name === currentValue)
    ? list
    : [{ _id: "current", name: currentValue }, ...list];
};

const Modal = ({ title, onClose, children }) => (
  <div
    className="ss-modal-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <div className="ss-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ss-modal-head">
        <h3>{title}</h3>
        <button
          type="button"
          className="ss-modal-x"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      {children}
    </div>
  </div>
);

const DetailRow = ({ label, children }) => (
  <div className="ss-detail-row">
    <span>{label}</span>
    <strong>{children}</strong>
  </div>
);

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const StockSummary = () => {
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [grades, setGrades] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [viewing, setViewing] = useState(null); // { group, entry }
  const [editing, setEditing] = useState(null); // { group, entry }
  const [editForm, setEditForm] = useState({ grade: "", size: "", remarks: "" });
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSummary = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const result = await fetchStockSummary();
      setGroups(result.data.groups);
    } catch (err) {
      setError("Couldn't load the stock summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();

    // Only needed for the Edit dialog; a failure here shouldn't break the page.
    const loadAttributes = async () => {
      try {
        const [gradeResult, sizeResult] = await Promise.all([
          gradeService.fetchAll(),
          sizeService.fetchAll(),
        ]);
        setGrades(gradeResult.data);
        setSizes(sizeResult.data);
      } catch (err) {
        /* dropdowns simply stay empty */
      }
    };
    loadAttributes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleGroups = useMemo(() => {
    // Every word typed must appear somewhere in "product grade size", so
    // "bluefish 3l" finds BlueFish / 5w30 Fully Synthetic / 3L.
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return groups;
    return groups.filter((group) => {
      const haystack =
        `${group.productName} ${group.grade} ${group.size}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [groups, search]);

  // Fold the flat, already-sorted (by productName -> grade -> size) variant
  // list into one entry per product, each holding its grade/size variants.
  // Because the backend already sorts by productName first, every group
  // belonging to the same product is adjacent, so a single pass is enough.
  const visibleProducts = useMemo(() => {
    const products = [];
    let current = null;

    for (const group of visibleGroups) {
      if (!current || current.productId !== group.productId) {
        current = {
          productId: group.productId,
          productName: group.productName,
          sku: group.sku,
          unit: group.unit,
          totalStock: 0,
          totalSold: 0,
          remaining: 0,
          variants: [],
        };
        products.push(current);
      }
      current.variants.push(group);
      current.totalStock = round2(current.totalStock + group.totalStock);
      current.totalSold = round2(current.totalSold + group.totalSold);
      current.remaining = round2(current.remaining + group.remaining);
    }
    return products;
  }, [visibleGroups]);

  const totals = useMemo(
    () => ({
      stock: visibleGroups.reduce((sum, g) => sum + g.totalStock, 0),
      sold: visibleGroups.reduce((sum, g) => sum + g.totalSold, 0),
      remaining: visibleGroups.reduce((sum, g) => sum + g.remaining, 0),
    }),
    [visibleGroups],
  );

  const openEdit = (group, entry) => {
    setEditing({ group, entry });
    setEditForm({
      grade: entry.grade || "",
      size: entry.size || "",
      remarks: entry.remarks || "",
    });
    setEditError("");
  };

  const handleEditSave = async (event) => {
    event.preventDefault();
    setEditError("");
    setSaving(true);
    try {
      await updatePurchaseDetails(editing.entry.id, editForm);
      setEditing(null);
      await loadSummary(false);
    } catch (err) {
      setEditError(err.response?.data?.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group, entry) => {
    const confirmed = window.confirm(
      `Delete this stock entry of ${fmtQty(entry.quantity)} ${group.unit} (${groupLabel(group)}, Inv #${entry.invoiceNumber})? This will reverse the stock it added.`,
    );
    if (!confirmed) return;

    try {
      await deletePurchase(entry.id);
      await loadSummary(false);
    } catch (err) {
      window.alert(
        err.response?.data?.message || "Failed to delete this stock entry.",
      );
    }
  };

  const setEditField = (field) => (event) =>
    setEditForm((prev) => ({ ...prev, [field]: event.target.value }));

  return (
    <div className="ss-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Summary</h1>
          <p className="page-subtitle">
            Every stock-in for each product, grade and size — and where it
            went. Stock is added through Purchases.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/dashboard/purchases/new")}
        >
          + Add Stock
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && groups.length === 0 && (
        <p className="page-subtitle">
          No stock recorded yet. Click "Add Stock" to record a purchase.
        </p>
      )}

      {!loading && !error && groups.length > 0 && (
        <>
          <div className="ss-toolbar">
            <div className="search-bar ss-search">
              <input
                type="text"
                placeholder="Search product, grade or size..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="ss-totals">
              <span>
                Stock in: <strong className="ss-green">{fmtQty(totals.stock)}</strong>
              </span>
              <span>
                Sold: <strong className="ss-red">{fmtQty(totals.sold)}</strong>
              </span>
              <span>
                Remaining:{" "}
                <strong className={totals.remaining < 0 ? "ss-red" : "ss-orange"}>
                  {fmtQty(totals.remaining)}
                </strong>
              </span>
            </div>
          </div>

          {visibleGroups.length === 0 && (
            <p className="page-subtitle">Nothing matches "{search}".</p>
          )}
        </>
      )}

      {/* ---------------------------- Stock in table --------------------------- */}
      {!loading && !error && visibleGroups.length > 0 && (
        <div className="table-wrapper ss-scroll">
          <table className="data-table ss-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Product</th>
                <th>Grade</th>
                <th>Size</th>
                <th className="num">Quantity</th>
                <th className="num">Rate</th>
                <th className="num">Total</th>
                <th>Remarks</th>
                <th className="table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product, productIndex) => (
                <Fragment key={product.productId}>
                  <tr className="ss-product-row">
                    <td colSpan={10}>
                      {productIndex + 1}. {product.productName} —{" "}
                      <span className="ss-group-total">
                        Total Stock: {formatAmount(product.totalStock)}
                      </span>
                    </td>
                  </tr>

                  {product.variants.map((variant, variantIndex) => (
                    <Fragment key={variant.key}>
                      <tr className="ss-variant-row">
                        <td colSpan={10}>
                          {productIndex + 1}.{variantIndex + 1}{" "}
                          {variant.grade || "—"} / {variant.size || "—"} —{" "}
                          <span className="ss-group-total">
                            Total Stock: {formatAmount(variant.totalStock)}
                          </span>
                        </td>
                      </tr>

                      {variant.stockEntries.length === 0 && (
                        <tr>
                          <td colSpan={10} className="ss-muted">
                            No stock-in recorded for this grade / size yet —
                            only sales. Use Edit on your earlier purchases to
                            tag them with this grade and size.
                          </td>
                        </tr>
                      )}

                      {variant.stockEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="nowrap">
                            {productIndex + 1}.{variantIndex + 1}
                          </td>
                          <td className="nowrap">
                            <DateCell
                              adIso={entryAdDate(entry)}
                              mode={entry.dateMode}
                            />
                          </td>
                          <td>{variant.productName}</td>
                          <td>{variant.grade || "—"}</td>
                          <td>{variant.size || "—"}</td>
                          <td className="num">
                            {formatAmount(entry.quantity)}
                            {entry.returnedQuantity > 0 && (
                              <div className="ss-sub">
                                −{fmtQty(entry.returnedQuantity)} returned
                              </div>
                            )}
                          </td>
                          <td className="num">{formatAmount(entry.rate)}</td>
                          <td className="num">{formatAmount(entry.total)}</td>
                          <td>{entry.remarks || "—"}</td>
                          <td className="table-actions-col">
                            <div className="ss-actions">
                              <button
                                type="button"
                                className="ss-link ss-link-view"
                                onClick={() => setViewing({ group: variant, entry })}
                              >
                                View
                              </button>
                              {entry.kind === "purchase" && (
                                <>
                                  <button
                                    type="button"
                                    className="ss-link ss-link-edit"
                                    onClick={() => openEdit(variant, entry)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="ss-link ss-link-delete"
                                    onClick={() => handleDelete(variant, entry)}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --------------------------- Stock usage cards ------------------------- */}
      {!loading && !error && visibleProducts.length > 0 && (
        <>
          <h2 className="ss-section-title">Stock Usage Summary</h2>

          {visibleProducts.map((product, productIndex) => (
            <div className="ss-usage-product" key={product.productId}>
              <h3 className="ss-usage-product-title">
                {productIndex + 1}. {product.productName} —{" "}
                <span className="ss-usage-total">
                  Total Stock: {fmtQty(product.totalStock)}
                </span>
              </h3>

              {product.variants.map((variant, variantIndex) => (
                <div className="ss-usage-card" key={variant.key}>
                  <h4 className="ss-usage-title">
                    {productIndex + 1}.{variantIndex + 1}{" "}
                    {variant.grade || "—"} / {variant.size || "—"} —{" "}
                    <span className="ss-usage-total">
                      Total Stock: {fmtQty(variant.totalStock)}
                    </span>
                  </h4>
                  <p className="ss-usage-sub">Sales details for this variant:</p>

                  {variant.sales.length === 0 ? (
                    <p className="ss-muted ss-no-sales">
                      No sales recorded for this variant yet.
                    </p>
                  ) : (
                    <div className="ss-scroll">
                      <table className="ss-usage-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Invoice Number</th>
                            <th>Client Name</th>
                            <th className="num">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variant.sales.map((sale) => (
                            <tr key={sale.invoiceId}>
                              <td className="nowrap">
                                <DateCell adIso={sale.date} mode={sale.dateMode} />
                              </td>
                              <td className="ss-mono">
                                <Link to={`/dashboard/sales/${sale.invoiceId}`}>
                                  Inv: {sale.invoiceNumber}
                                </Link>
                              </td>
                              <td>{sale.customerName}</td>
                              <td className="num ss-qty">{fmtQty(sale.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="ss-usage-foot">
                    <span>
                      Total Stock:{" "}
                      <strong className="ss-green">{fmtQty(variant.totalStock)}</strong>
                    </span>
                    <span>
                      Total Sold:{" "}
                      <strong className="ss-red">{fmtQty(variant.totalSold)}</strong>
                    </span>
                    <span>
                      Remaining Stock:{" "}
                      <strong className={variant.remaining < 0 ? "ss-red" : "ss-orange"}>
                        {fmtQty(variant.remaining)}
                      </strong>
                    </span>
                  </div>

                  {variant.remaining < 0 && (
                    <p className="ss-warn">
                      More was sold than the stock recorded for this grade /
                      size. If the stock was bought earlier without a grade /
                      size, open those purchases with Edit above and tag them.
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* -------------------------------- View --------------------------------- */}
      {viewing && (
        <Modal title="Stock entry details" onClose={() => setViewing(null)}>
          <DetailRow label="Product">{viewing.group.productName}</DetailRow>
          <DetailRow label="Grade">{viewing.group.grade || "—"}</DetailRow>
          <DetailRow label="Size">{viewing.group.size || "—"}</DetailRow>
          <DetailRow label="Date">
            <DateCell
              adIso={entryAdDate(viewing.entry)}
              mode={viewing.entry.dateMode}
            />
          </DetailRow>
          <DetailRow label="Quantity">
            {fmtQty(viewing.entry.quantity)} {viewing.group.unit}
          </DetailRow>
          {viewing.entry.returnedQuantity > 0 && (
            <DetailRow label="Returned to supplier">
              {fmtQty(viewing.entry.returnedQuantity)} {viewing.group.unit}
            </DetailRow>
          )}
          <DetailRow label="Rate">{formatAmount(viewing.entry.rate)}</DetailRow>
          <DetailRow label="Total">{formatAmount(viewing.entry.total)}</DetailRow>

          {viewing.entry.kind === "purchase" ? (
            <>
              <DetailRow label="Supplier">
                {viewing.entry.supplierName || "—"}
              </DetailRow>
              <DetailRow label="Invoice #">
                {viewing.entry.invoiceNumber || "—"}
              </DetailRow>
              <DetailRow label="Amount paid">
                {formatAmount(viewing.entry.amountPaid)}
              </DetailRow>
              <DetailRow label="Due amount">
                {formatAmount(viewing.entry.dueAmount)}
              </DetailRow>
            </>
          ) : (
            <p className="field-hint">
              Opening stock — entered when this product was created, so it has
              no supplier or invoice.
            </p>
          )}

          <DetailRow label="Remarks">{viewing.entry.remarks || "—"}</DetailRow>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setViewing(null)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* -------------------------------- Edit --------------------------------- */}
      {editing && (
        <Modal
          title={`Edit — ${groupLabel(editing.group)}`}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={handleEditSave}>
            <div className="login-field">
              <label htmlFor="ss-grade">Grade</label>
              <select
                id="ss-grade"
                value={editForm.grade}
                onChange={setEditField("grade")}
              >
                <option value="">-- No grade --</option>
                {withFallback(grades, editForm.grade).map((g) => (
                  <option key={g._id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="login-field">
              <label htmlFor="ss-size">Size</label>
              <select
                id="ss-size"
                value={editForm.size}
                onChange={setEditField("size")}
              >
                <option value="">-- No size --</option>
                {withFallback(sizes, editForm.size).map((s) => (
                  <option key={s._id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="login-field">
              <label htmlFor="ss-remarks">Remarks</label>
              <input
                id="ss-remarks"
                type="text"
                maxLength={300}
                value={editForm.remarks}
                onChange={setEditField("remarks")}
              />
              <p className="field-hint">
                Only grade, size and remarks can be changed here. To change the
                quantity or rate, delete this entry and record it again.
              </p>
            </div>

            {editError && <p className="error-text">{editError}</p>}

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default StockSummary;