import { useEffect, useState } from "react";

const AttributeManager = ({ title, service }) => {
  const [items, setItems] = useState([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const result = await service.fetchAll();
      setItems(result.data);
    } catch (err) {
      setError(`Couldn't load ${title.toLowerCase()}s.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (event) => {
    event.preventDefault();
    setError("");
    if (!newName.trim()) return;
    try {
      await service.create(newName.trim());
      setNewName("");
      load();
    } catch (err) {
      setError(
        err.response?.data?.message || `Failed to add ${title.toLowerCase()}.`,
      );
    }
  };

  const startEdit = (item) => {
    setEditingId(item._id);
    setEditingName(item.name);
  };

  const saveEdit = async (id) => {
    setError("");
    try {
      await service.update(id, editingName.trim());
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update.");
    }
  };

  const handleDelete = async (item) => {
    if (
      !window.confirm(
        `Delete "${item.name}"? Products already using it will keep the value, but it won't appear in the dropdown anymore.`,
      )
    )
      return;
    try {
      await service.remove(item._id);
      load();
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to delete.");
    }
  };

  return (
    <div className="attribute-manager">
      <h3>{title}</h3>
      {error && <p className="error-text">{error}</p>}

      <form className="attribute-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder={`Add new ${title.toLowerCase()}`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn btn-outline btn-sm">
          Add
        </button>
      </form>

      {loading ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p className="field-hint">No {title.toLowerCase()}s yet.</p>
      ) : (
        <ul className="attribute-list">
          {items.map((item) => (
            <li key={item._id}>
              {editingId === item._id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => saveEdit(item._id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span>{item.name}</span>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => startEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-danger"
                      onClick={() => handleDelete(item)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AttributeManager;
