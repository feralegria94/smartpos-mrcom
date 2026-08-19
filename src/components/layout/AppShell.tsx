import { ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import Extras from "../Extras";

const BASE_LINKS = [
  { to: "/", label: "Caja", icon: "point_of_sale" },
  { to: "/productos", label: "Productos", icon: "inventory_2" },
  { to: "/clientes", label: "Clientes", icon: "groups" },
  { to: "/reportes", label: "Reportes", icon: "insights" },
  { to: "/ajustes", label: "Ajustes", icon: "settings" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { tenant, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [light, setLight] = useState(() => document.documentElement.classList.contains("light"));

  // Gestión de usuarios: solo owner y admin.
  const links = useMemo(() => {
    const l = [...BASE_LINKS];
    if (profile?.role === "owner" || profile?.role === "admin") {
      l.push({ to: "/usuarios", label: "Usuarios", icon: "group" });
    }
    return l;
  }, [profile?.role]);

  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
    try {
      localStorage.setItem("smartpos_theme", light ? "light" : "dark");
    } catch {
      /* ignore */
    }
  }, [light]);

  async function logout() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-ink-soft/60 p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="material-symbols-rounded text-accent">nightlight</span>
          <div>
            <p className="text-sm font-semibold text-white">SmartPOS</p>
            <p className="text-xs text-white/40">{tenant?.name ?? "—"}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-moon-600/20 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <span className="material-symbols-rounded text-[20px]">{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-white/5 pt-4 text-xs text-white/40">
          <p>{profile?.full_name || profile?.email}</p>
          <p className="capitalize">{profile?.role}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setLight(!light)}
              className="text-white/60 hover:text-white"
              title="Cambiar tema"
            >
              <span className="material-symbols-rounded align-middle text-[18px]">
                {light ? "dark_mode" : "light_mode"}
              </span>
            </button>
            <button onClick={logout} className="text-white/60 hover:text-white">
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-8 md:pb-8">
        <div className="mb-4 flex justify-end">
          <Extras />
        </div>
        {children}
      </main>

      {/* Navegación inferior (móvil/tablet) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-ink-soft/95 backdrop-blur md:hidden">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition ${
                isActive ? "text-accent" : "text-white/50"
              }`
            }
          >
            <span className="material-symbols-rounded text-[22px]">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
