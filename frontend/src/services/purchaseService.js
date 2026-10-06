import api from "./api";

export const fetchPurchases = async (supplierId) => {
  const response = await api.get("/purchases", {
    params: supplierId ? { supplier: supplierId } : {},
  });
  return response.data;
};

export const fetchPurchasesByProduct = async (productId) => {
  const response = await api.get("/purchases", {
    params: { product: productId },
  });
  return response.data;
};

export const fetchPurchaseById = async (id) => {
  const response = await api.get(`/purchases/${id}`);
  return response.data;
};

export const createPurchase = async (payload) => {
  const response = await api.post("/purchases", payload);
  return response.data;
};

// Edits only grade / size / remarks of a purchase — no stock or money impact.
export const updatePurchaseDetails = async (id, payload) => {
  const response = await api.put(`/purchases/${id}/details`, payload);
  return response.data;
};

export const createPurchaseReturn = async (purchaseId, payload) => {
  const response = await api.post(`/purchases/${purchaseId}/return`, payload);
  return response.data;
};

export const deletePurchase = async (id) => {
  const response = await api.delete(`/purchases/${id}`);
  return response.data;
};