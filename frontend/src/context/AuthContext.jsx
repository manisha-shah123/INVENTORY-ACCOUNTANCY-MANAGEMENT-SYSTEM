import { createContext, useContext, useEffect, useState } from "react";
import { loginAdmin, registerCompany, fetchMe } from "../services/authService";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true); // true while we check for an existing session

  // On first load, if a token is stored, verify it's still valid with the backend
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const result = await fetchMe();
        setAdmin(result.data.admin);
      } catch (error) {
        localStorage.removeItem("token");
        localStorage.removeItem("admin");
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email, password) => {
    const result = await loginAdmin(email, password);

    localStorage.setItem("token", result.data.token);
    localStorage.setItem("admin", JSON.stringify(result.data.admin));
    setAdmin(result.data.admin);

    return result;
  };

  const register = async (companyName, email, password) => {
    const result = await registerCompany(companyName, email, password);

    localStorage.setItem("token", result.data.token);
    localStorage.setItem("admin", JSON.stringify(result.data.admin));
    setAdmin(result.data.admin);

    return result;
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("admin");
    setAdmin(null);
  };

  return (
    <AuthContext.Provider
      value={{ admin, loading, login, register, logout, isAuthenticated: !!admin }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};
