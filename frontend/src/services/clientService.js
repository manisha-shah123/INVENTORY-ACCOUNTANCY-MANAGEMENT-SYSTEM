import api from "./api";

export const fetchClients = async (type) => {
  const response = await api.get("/clients", {
    params: type ? { type } : {},
  });
  return response.data;
};

export const fetchClientById = async (id) => {
  const response = await api.get(`/clients/${id}`);
  return response.data;
};

export const createClient = async (payload) => {
  const response = await api.post("/clients", payload);
  return response.data;
};

export const updateClient = async (id, payload) => {
  const response = await api.put(`/clients/${id}`, payload);
  return response.data;
};

export const deleteClient = async (id) => {
  const response = await api.delete(`/clients/${id}`);
  return response.data;
};

export const fetchClientSummaryReport = async (type = "customer", filters = {}) => {
  const { customerCategory, location, startDate, endDate } = filters;
  const params = { type };
  if (customerCategory) params.customerCategory = customerCategory;
  if (location) params.location = location;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const response = await api.get("/clients/summary-report", { params });
  return response.data;
};
