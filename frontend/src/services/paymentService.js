import api from "./api";

export const fetchPayments = async (clientId) => {
  const response = await api.get("/payments", {
    params: clientId ? { client: clientId } : {},
  });
  return response.data;
};

export const fetchPendingInvoices = async (type, clientId) => {
  const response = await api.get("/payments/pending", {
    params: { type, clientId },
  });
  return response.data;
};

export const fetchPaymentById = async (id) => {
  const response = await api.get(`/payments/${id}`);
  return response.data;
};

export const createPayment = async (payload) => {
  const response = await api.post("/payments", payload);
  return response.data;
};

export const updatePayment = async (id, payload) => {
  const response = await api.put(`/payments/${id}`, payload);
  return response.data;
};

export const deletePayment = async (id) => {
  const response = await api.delete(`/payments/${id}`);
  return response.data;
};
