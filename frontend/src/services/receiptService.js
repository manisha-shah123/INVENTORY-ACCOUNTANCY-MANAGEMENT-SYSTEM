import api from "./api";

export const fetchCustomerSummary = async (customerId) => {
  const response = await api.get(`/clients/${customerId}/summary`);
  return response.data;
};

export const fetchReceipts = async (customerId) => {
  const response = await api.get("/receipts", {
    params: customerId ? { customer: customerId } : {},
  });
  return response.data;
};

export const fetchReceiptById = async (id) => {
  const response = await api.get(`/receipts/${id}`);
  return response.data;
};

export const createReceipt = async (payload) => {
  const response = await api.post("/receipts", payload);
  return response.data;
};

export const updateReceipt = async (id, payload) => {
  const response = await api.put(`/receipts/${id}`, payload);
  return response.data;
};

export const deleteReceipt = async (id) => {
  const response = await api.delete(`/receipts/${id}`);
  return response.data;
};
