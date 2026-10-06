import api from "./api";

export const fetchStockSummary = async () => {
  const response = await api.get("/stock-summary");
  return response.data;
};