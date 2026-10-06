import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchClients, deleteClient } from "../services/clientService";

const LABELS = {
  customer: { title: "Customers", singular: "Customer" },
  supplier: { title: "Suppliers", singular: "Supplier" },
};

const CATEGORY_LABELS = {
  normal: "Normal Customer",
  distributor: "Distributor",
  wholesaler: "Wholesaler",
  retailer: "Retailer",
};

const ClientList = ({ type }) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const labels = LABELS[type];

  const loadClients = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchClients(type);
      setClients(result.data);
    } catch (err) {
      setError(`Couldn't load ${labels.title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const handleDelete = async (client) => {
    const confirmed = window.confirm(
      `Delete ${client.name}? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await deleteClient(client._id);
      setClients((prev) => prev.filter((c) => c._id !== client._id));
    } catch (err) {
      window.alert(`Failed to delete ${client.name}.`);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{labels.title}</h1>
          <p className="page-subtitle">
            Manage your {labels.title.toLowerCase()} list.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-outline"
            onClick={() =>
              navigate(`/dashboard/${type}s/summary-report`)
            }
          >
            All {labels.title} Summary Report
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/dashboard/${type}s/new`)}
          >
            + Add New {labels.singular}
          </button>
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && clients.length === 0 && (
        <p className="page-subtitle">
          No {labels.title.toLowerCase()} yet. Click "Add New {labels.singular}"
          to create one.
        </p>
      )}

      {!loading && !error && clients.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                {type === "customer" && <th>Customer Type</th>}
                {type === "supplier" && <th>Country</th>}
                <th>Phone</th>
                <th>Email</th>
                <th>VAT Number</th>
                <th className="table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client._id}>
                  <td>{client.name}</td>
                  {type === "customer" && (
                    <td>
                      {CATEGORY_LABELS[client.customerCategory] ||
                        "Normal Customer"}
                    </td>
                  )}
                  {type === "supplier" && <td>{client.country || "—"}</td>}
                  <td>{client.phone || "—"}</td>
                  <td>{client.email || "—"}</td>
                  <td>{client.vatNumber || "—"}</td>
                  <td className="table-actions-col">
                    <div className="table-actions">
                      {type === "customer" && (
                        <Link
                          className="btn btn-outline btn-sm"
                          to={`/dashboard/customers/${client._id}/statement`}
                        >
                          Statement
                        </Link>
                      )}
                      <Link
                        className="btn btn-outline btn-sm"
                        to={`/dashboard/${type}s/${client._id}/edit`}
                      >
                        Edit
                      </Link>
                      <button
                        className="btn btn-outline btn-sm btn-danger"
                        onClick={() => handleDelete(client)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ClientList;
