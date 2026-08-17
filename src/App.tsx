import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import AppShell from "./components/layout/AppShell";
import Login from "./auth/Login";
import Onboarding from "./pages/Onboarding";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-white/50">
        Cargando…
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Usuario sin tenant (raro) o sin negocio configurado -> onboarding
  if (!profile?.tenant_id) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/productos" element={<Products />} />
        <Route path="/clientes" element={<Customers />} />
        <Route path="/reportes" element={<Reports />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
