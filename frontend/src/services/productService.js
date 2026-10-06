import api from "./api";

export const fetchProducts = async (search) => {
  const response = await api.get("/products", {
    params: search ? { search } : {},
  });
  return response.data;
};

export const fetchProductById = async (id) => {
  const response = await api.get(`/products/${id}`);
  return response.data;
};

export const createProduct = async (payload) => {
  const response = await api.post("/products", payload);
  return response.data;
};

export const updateProduct = async (id, payload) => {
  const response = await api.put(`/products/${id}`, payload);
  return response.data;
};

export const deleteProduct = async (id) => {
  const response = await api.delete(`/products/${id}`);
  return response.data;
};

export const adjustStock = async (id, payload) => {
  const response = await api.post(`/products/${id}/stock`, payload);
  return response.data;
};

export const fetchStockHistory = async (id) => {
  const response = await api.get(`/products/${id}/stock`);
  return response.data;
};
