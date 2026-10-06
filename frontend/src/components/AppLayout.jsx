import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/dashboard", label: "Dashboard", end: true },
  { to: "/dashboard/products", label: "Products / Stock" },
  { to: "/dashboard/stock-summary", label: "Stock Summary" },
  { to: "/dashboard/customers", label: "Customers" },
  { to: "/dashboard/suppliers", label: "Suppliers" },
  { to: "/dashboard/purchases", label: "Purchase" },
  { to: "/dashboard/sales", label: "Sales" },
  { to: "/dashboard/hisab-kitab", label: "Hisab-Kitab" },
  { to: "/dashboard/expenses", label: "Expense" },
  { to: "/dashboard/balance-sheet", label: "Balance Sheet" },
];

const AppLayout = () => {
  const { admin, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          {admin?.companyName || "Inventory MS"}
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                "sidebar-link" + (isActive ? " sidebar-link--active" : "")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <span className="topbar-email">{admin?.email}</span>
          <button className="btn btn-outline" onClick={logout}>
            Logout
          </button>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;