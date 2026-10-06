import api from "./api";

export const fetchExpenses = async (category) => {
  const response = await api.get("/expenses", {
    params: category ? { category } : {},
  });
  return response.data;
};

export const fetchExpenseById = async (id) => {
  const response = await api.get(`/expenses/${id}`);
  return response.data;
};

export const createExpense = async (payload) => {
  const response = await api.post("/expenses", payload);
  return response.data;
};

export const updateExpense = async (id, payload) => {
  const response = await api.put(`/expenses/${id}`, payload);
  return response.data;
};

export const deleteExpense = async (id) => {
  const response = await api.delete(`/expenses/${id}`);
  return response.data;
};
