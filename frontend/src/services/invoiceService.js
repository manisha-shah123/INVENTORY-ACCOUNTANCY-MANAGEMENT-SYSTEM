import api from "./api";

export const fetchInvoices = async (customerId) => {
  const response = await api.get("/invoices", {
    params: customerId ? { customer: customerId } : {},
  });
  return response.data;
};

export const fetchInvoiceById = async (id) => {
  const response = await api.get(`/invoices/${id}`);
  return response.data;
};

export const createInvoice = async (payload) => {
  const response = await api.post("/invoices", payload);
  return response.data;
};

export const updateInvoice = async (id, payload) => {
  const response = await api.put(`/invoices/${id}`, payload);
  return response.data;
};

export const deleteInvoice = async (id) => {
  const response = await api.delete(`/invoices/${id}`);
  return response.data;
};