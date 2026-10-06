import api from "./api";

// filters: { startDate, endDate } — both AD "YYYY-MM-DD", both optional.
// The date filter only affects Total Sales and Total Purchase on the server.
export const fetchDashboardSummary = async (filters = {}) => {
  const params = {};
  if (filters.startDate) params.startDate = filters.startDate;
  if (filters.endDate) params.endDate = filters.endDate;

  const response = await api.get("/dashboard/summary", { params });
  return response.data;
};