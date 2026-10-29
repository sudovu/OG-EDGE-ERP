import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { api } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import CustomersPage from "./pages/CustomersPage";
import SalesPage from "./pages/SalesPage";
import InventoryPage from "./pages/InventoryPage";
import ServicesPage from "./pages/ServicesPage";
import SettingsPage from "./pages/SettingsPage";

function useIsAuthed() {
  return !!localStorage.getItem("token");
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const nav = [
    { to: "/", label: "Dashboard" },
    { to: "/products", label: "Catalog" },
    { to: "/customers", label: "Customers" },
    { to: "/sales", label: "Sales" },
    { to: "/inventory", label: "Inventory" },
    { to: "/services", label: "Services" },
    { to: "/settings", label: "Settings" },
  ];
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-900 text-slate-100 p-4 space-y-2">
        <div className="text-xl font-bold mb-4">OG-EDGE ERP</div>
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className={`block px-3 py-2 rounded ${location.pathname === n.to ? "bg-slate-700" : "hover:bg-slate-800"}`}
          >
            {n.label}
          </Link>
        ))}
        <button
          className="mt-6 w-full text-left px-3 py-2 rounded hover:bg-slate-800 text-red-300"
          onClick={() => {
            localStorage.clear();
            window.location.href = "/login";
          }}
        >
          Logout
        </button>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  if (!useIsAuthed()) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  useEffect(() => {
    if (localStorage.getItem("token") && !localStorage.getItem("orgId")) {
      api.get("/organizations").then((r) => {
        const list = r.data.data;
        if (list?.length) {
          localStorage.setItem("orgId", list[0].id);
        }
      }).catch(() => {});
    }
  }, []);
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Guard><DashboardPage /></Guard>} />
      <Route path="/products" element={<Guard><ProductsPage /></Guard>} />
      <Route path="/customers" element={<Guard><CustomersPage /></Guard>} />
      <Route path="/sales" element={<Guard><SalesPage /></Guard>} />
      <Route path="/inventory" element={<Guard><InventoryPage /></Guard>} />
      <Route path="/services" element={<Guard><ServicesPage /></Guard>} />
      <Route path="/settings" element={<Guard><SettingsPage /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}