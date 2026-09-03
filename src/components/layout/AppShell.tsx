import { ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { isSubscriptionActive, PLAN_NAMES } from "../../lib/limits";
import { isPlatformAdmin } from "../../lib/plans";
import Extras from "../Extras";

const BASE_LINKS = [
  { to: "/", label: "Caja", icon: "point_of_sale" },
  { to: "/productos", label: "Productos", icon: "inventory_2" },
  { to: "/clientes", label: "Clientes", icon: "groups" },
  { to: "/despacho", label: "Despacho", icon: "local_shipping" },
  { to: "/reportes", label: "Reportes", icon: "insights" },
  { to: "/ajustes", label: "Ajustes", icon: "settings" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { tenant, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [light, setLight] = useState(() => document.documentElement.classList.contains("light"));
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    isPlatformAdmin().then(setPlatformAdmin).catch(() => setPlatformAdmin(false));
  }, []);

  // Gestión de usuarios: solo owner y admin.
  // En móvil la barra inferior queda apretada con demasiados items, por eso
  // separamos: primarios (siempre visibles, máx 4) y secundarios (menú "Más").
  const { primaryLinks, secondaryLinks, allLinks } = useMemo(() => {
    const secondary: { to: string; label: string; icon: string }[] = [];
    if (profile?.role === "owner" || profile?.role === "admin") {
      secondary.push({ to: "/usuarios", label: "Usuarios", icon: "group" });
      secondary.push({ to: "/diagnostico", label: "Diagnóstico", icon: "monitor_heart" });
    }
    if (platformAdmin) {
      secondary.push({ to: "/admin", label: "Administración", icon: "admin_panel_settings" });
    }
    // Todos los links del menú lateral (navegación completa).
    const all = [...BASE_LINKS, ...secondary];
    // Primarios = los 4 más usados en caja, para no abarrotar la barra móvil.
    const primary = [
      BASE_LINKS[0], // Caja
      BASE_LINKS[1], // Productos
      BASE_LINKS[2], // Clientes
      BASE_LINKS[4], // Reportes
    ];
    // Secundarios = el resto (incluye Despacho, Ajustes y los de rol).
    const rest = all.filter((l) => !primary.includes(l));
    return { primaryLinks: primary, secondaryLinks: rest, allLinks: all };
  }, [profile?.role, platformAdmin]);

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
          {allLinks.map((l) => (
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
          <p className="mb-3 capitalize">{profile?.role}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLight(!light)}
              className="rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white"
              title="Cambiar tema"
            >
              <span className="material-symbols-rounded align-middle text-[18px]">
                {light ? "dark_mode" : "light_mode"}
              </span>
            </button>
            <button
              onClick={logout}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-300 transition hover:bg-red-500/20 hover:text-red-200"
            >
              <span className="material-symbols-rounded align-middle text-[18px]">logout</span>
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-8 md:pb-8">
        <div className="mb-4 flex justify-end">
          <Extras />
        </div>
        {!isSubscriptionActive(tenant) && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Tu suscripción al plan {PLAN_NAMES[tenant?.plan ?? "basico"]} está vencida o cancelada.{" "}
            <button onClick={() => navigate("/ajustes")} className="font-semibold text-red-200 underline">
              Renovar ahora
            </button>
          </div>
        )}
        {children}
      </main>

      {/* Navegación inferior (móvil/tablet): solo primarios + menú "Más". */}
      <div className="md:hidden">
        {/* Overlay para cerrar el menú "Más" */}
        {moreOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
        )}

        {/* Panel desplegable "Más" */}
        <div
          className={`fixed inset-x-0 bottom-16 z-50 rounded-t-2xl border-t border-white/10 bg-ink-soft p-4 transition-transform duration-200 ${
            moreOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Más opciones</p>
            <button
              onClick={() => setMoreOpen(false)}
              className="rounded-lg p-1 text-white/50 hover:text-white"
              title="Cerrar"
            >
              <span className="material-symbols-rounded">close</span>
            </button>
          </div>
          <div className="space-y-1">
            {secondaryLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                    isActive
                      ? "bg-moon-600/20 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <span className="material-symbols-rounded text-[20px]">{l.icon}</span>
                {l.label}
              </NavLink>
            ))}
            <button
              onClick={logout}
              className="mt-2 flex w-full items-center gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-3 text-sm text-red-300 transition hover:bg-red-500/20 hover:text-red-200"
            >
              <span className="material-symbols-rounded text-[20px]">logout</span>
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* Barra inferior: primarios + botón "Más" */}
        <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-white/10 bg-ink-soft/95 backdrop-blur">
          {primaryLinks.map((l) => (
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
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition ${
              moreOpen ? "text-accent" : "text-white/50"
            }`}
          >
            <span className="material-symbols-rounded text-[22px]">more_horiz</span>
            Más
          </button>
        </nav>
      </div>
    </div>
  );
}
