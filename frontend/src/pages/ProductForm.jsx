import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  fetchProductById,
  createProduct,
  updateProduct,
} from "../services/productService";
import {
  brandService,
  categoryService,
} from "../services/attributeService";

const EMPTY_FORM = {
  name: "",
  sku: "",
  brand: "",
  category: "",
  hsCode: "",
  unit: "pcs",
  purchasePrice: "",
  sellingPrice: "",
  minimumStock: "",
  openingStock: "",
};

const validateForm = (form) => {
  if (!/[A-Za-z]/.test(form.name.trim())) {
    return "Product name must contain letters, not just numbers.";
  }
  if (!form.sku.trim()) {
    return "SKU is required.";
  }
  if (form.purchasePrice === "" || Number(form.purchasePrice) < 0) {
    return "Purchase price must be 0 or greater.";
  }
  if (form.sellingPrice === "" || Number(form.sellingPrice) < 0) {
    return "Selling price must be 0 or greater.";
  }
  if (Number(form.sellingPrice) < Number(form.purchasePrice)) {
    return `Selling price cannot be less than purchase price (${form.purchasePrice}).`;
  }
  if (form.minimumStock !== "" && Number(form.minimumStock) < 0) {
    return "Minimum stock cannot be negative.";
  }
  if (form.openingStock !== "" && Number(form.openingStock) < 0) {
    return "Opening stock cannot be negative.";
  }
  return "";
};

// Ensures a legacy/free-text value that isn't in the master list still shows up as an option,
// instead of silently disappearing from the dropdown.
const withFallback = (list, currentValue) => {
  if (!currentValue) return list;
  const exists = list.some((item) => item.name === currentValue);
  return exists ? list : [{ _id: "current", name: currentValue }, ...list];
};

const ProductForm = () => {
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [form, setForm] = useState(EMPTY_FORM);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [brandRes, categoryRes] = await Promise.all([
          brandService.fetchAll(),
          categoryService.fetchAll(),
        ]);
        setBrands(brandRes.data);
        setCategories(categoryRes.data);

        if (isEditMode) {
          const result = await fetchProductById(id);
          const product = result.data;
          setForm({
            name: product.name || "",
            sku: product.sku || "",
            brand: product.brand || "",
            category: product.category || "",
            hsCode: product.hsCode || "",
            unit: product.unit || "pcs",
            purchasePrice: String(product.purchasePrice ?? ""),
            sellingPrice: String(product.sellingPrice ?? ""),
            minimumStock: String(product.minimumStock ?? ""),
            openingStock: "",
          });
        }
      } catch (err) {
        setError("Couldn't load product attributes.");
      } finally {
        setLoading(false);
      }
    };

    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
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

    const payload = {
      name: form.name,
      sku: form.sku,
      brand: form.brand,
      category: form.category,
      hsCode: form.hsCode,
      unit: form.unit,
      purchasePrice: Number(form.purchasePrice),
      sellingPrice: Number(form.sellingPrice),
      minimumStock: form.minimumStock === "" ? 0 : Number(form.minimumStock),
    };

    if (!isEditMode) {
      payload.openingStock =
        form.openingStock === "" ? 0 : Number(form.openingStock);
    }

    try {
      if (isEditMode) {
        await updateProduct(id, payload);
      } else {
        await createProduct(payload);
      }
      navigate("/dashboard/products", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <form className="form-wcard" onSubmit={handleSubmit}>
        <div className="login-field">
          <label htmlFor="name">Product Name</label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={handleChange("name")}
            required
          />
        </div>

        <div className="login-field">
          <label htmlFor="sku">SKU</label>
          <input
            id="sku"
            type="text"
            value={form.sku}
            onChange={handleChange("sku")}
            required
          />
        </div>

        <div className="login-field">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={form.category}
            onChange={handleChange("category")}
          >
            <option value="">-- Select Category --</option>
            {withFallback(categories, form.category).map((c) => (
              <option key={c._id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="login-field">
          <label htmlFor="brand">Brand</label>
          <select
            id="brand"
            value={form.brand}
            onChange={handleChange("brand")}
          >
            <option value="">-- Select Brand --</option>
            {withFallback(brands, form.brand).map((b) => (
              <option key={b._id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="login-field">
          <label htmlFor="hsCode">HS Code</label>
          <input
            id="hsCode"
            type="text"
            value={form.hsCode}
            onChange={handleChange("hsCode")}
          />
        </div>

        <div className="login-field">
          <label htmlFor="unit">Unit</label>
          <input
            id="unit"
            type="text"
            list="unit-suggestions"
            value={form.unit}
            onChange={handleChange("unit")}
          />
          <datalist id="unit-suggestions">
            <option value="pcs" />
            <option value="kg" />
            <option value="ltr" />
            <option value="box" />
            <option value="dozen" />
          </datalist>
        </div>

        <div className="login-field">
          <label htmlFor="purchasePrice">Purchase Price</label>
          <input
            id="purchasePrice"
            type="number"
            min="0"
            step="0.01"
            value={form.purchasePrice}
            onChange={handleChange("purchasePrice")}
            required
          />
        </div>

        <div className="login-field">
          <label htmlFor="sellingPrice">Selling Price</label>
          <input
            id="sellingPrice"
            type="number"
            min="0"
            step="0.01"
            value={form.sellingPrice}
            onChange={handleChange("sellingPrice")}
            required
          />
          <p className="field-hint">Cannot be less than purchase price.</p>
        </div>

        <div className="login-field">
          <label htmlFor="minimumStock">Minimum Stock</label>
          <input
            id="minimumStock"
            type="number"
            min="0"
            value={form.minimumStock}
            onChange={handleChange("minimumStock")}
          />
        </div>

        {!isEditMode && (
          <div className="login-field">
            <label htmlFor="openingStock">Opening Stock</label>
            <input
              id="openingStock"
              type="number"
              min="0"
              value={form.openingStock}
              onChange={handleChange("openingStock")}
            />
            <p className="field-hint">
              Stock you already have on hand right now. Leave blank for 0 - you
              can add stock later from "Adjust Stock".
            </p>
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
            onClick={() => navigate("/dashboard/products")}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;