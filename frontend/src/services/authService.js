import api from "./api";

export const registerCompany = async (companyName, email, password) => {
  const response = await api.post("/auth/register", {
    companyName,
    email,
    password,
  });
  return response.data;
};

export const loginAdmin = async (email, password) => {
  const response = await api.post("/auth/login", { email, password });
  return response.data;
};

export const fetchMe = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};
