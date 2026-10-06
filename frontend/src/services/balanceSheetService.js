import api from "./api";

// params: { asOf, fyStart, prevAsOf?, prevFyStart? }  (all YYYY-MM-DD, AD)
export const fetchBalanceSheet = async (params) => {
  const response = await api.get("/balance-sheet", { params });
  return response.data;
};

export const fetchOpeningBalances = async () => {
  const response = await api.get("/balance-sheet/opening");
  return response.data;
};

export const saveOpeningBalances = async (payload) => {
  const response = await api.put("/balance-sheet/opening", payload);
  return response.data;
};

export const fetchEntryTypes = async () => {
  const response = await api.get("/balance-sheet/entry-types");
  return response.data;
};

export const fetchEntries = async () => {
  const response = await api.get("/balance-sheet/entries");
  return response.data;
};

export const createEntry = async (payload) => {
  const response = await api.post("/balance-sheet/entries", payload);
  return response.data;
};

export const updateEntry = async (id, payload) => {
  const response = await api.put(`/balance-sheet/entries/${id}`, payload);
  return response.data;
};

export const deleteEntry = async (id) => {
  const response = await api.delete(`/balance-sheet/entries/${id}`);
  return response.data;
};