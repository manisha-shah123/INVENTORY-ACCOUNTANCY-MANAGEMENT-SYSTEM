import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchProducts, deleteProduct } from "../services/productService";

const ProductList = () => {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const loadProducts = async (searchTerm) => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchProducts(searchTerm);
      setProducts(result.data);
    } catch (err) {
      setError("Couldn't load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts("");
  }, []);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    loadProducts(search);
  };

  const handleDelete = async (product) => {
    const confirmed = window.confirm(
      `Delete ${product.name}? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await deleteProduct(product._id);
      setProducts((prev) => prev.filter((p) => p._id !== product._id));
    } catch (err) {
      window.alert(`Failed to delete ${product.name}.`);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Products / Stock</h1>
          <p className="page-subtitle">
            Manage your product catalog and stock levels.
          </p>
        </div>
        <div className="table-actions">
          <Link className="btn btn-outline" to="/dashboard/products/attributes">
            Manage Brand / Category / Grade / Size
          </Link>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/dashboard/products/new")}
          >
            + Add New Product
          </button>
        </div>
      </div>

      <form className="search-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          placeholder="Search by name, SKU, or category..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className="btn btn-outline" type="submit">
          Search
        </button>
      </form>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && products.length === 0 && (
        <p className="page-subtitle">
          No products yet. Click "Add New Product" to create one.
        </p>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Purchase Price</th>
                <th>Selling Price</th>
                <th>Current Stock</th>
                <th className="table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const isLowStock = product.currentStock <= product.minimumStock;
                return (
                  <tr key={product._id}>
                    <td>{product.name}</td>
                    <td>{product.sku}</td>
                    <td>{product.category || "—"}</td>
                    <td>{product.unit}</td>
                    <td>{product.purchasePrice.toLocaleString()}</td>
                    <td>{product.sellingPrice.toLocaleString()}</td>
                    <td>
                      <span className={isLowStock ? "stock-low" : ""}>
                        {product.currentStock} {product.unit}
                      </span>
                      {isLowStock && <span className="badge-low">Low</span>}
                    </td>
                    <td className="table-actions-col">
                      <div className="table-actions">
                        <Link
                          className="btn btn-outline btn-sm"
                          to={`/dashboard/products/${product._id}/stock`}
                        >
                          Adjust Stock
                        </Link>
                        <Link
                          className="btn btn-outline btn-sm"
                          to={`/dashboard/products/${product._id}/edit`}
                        >
                          Edit
                        </Link>
                        <button
                          className="btn btn-outline btn-sm btn-danger"
                          onClick={() => handleDelete(product)}
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

export default ProductList;
