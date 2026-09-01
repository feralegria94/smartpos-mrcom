import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  bootstrapPlatformAdmin,
  formatPlanPrice,
  getAdminStats,
  getPlans,
  isPlatformAdmin,
  listTenants,
  updatePlan,
  updateTenant,
  type AdminStats,
  type PlanDef,
  type TenantRow,
} from "../lib/plans";
import { normalizeCLP } from "../lib/format";
import { syncPlanLimits } from "../lib/limits";
import type { Plan, SubscriptionStatus } from "../types";

type Tab = "resumen" | "planes" | "negocios";

const PLAN_ORDER: Plan[] = ["basico", "pro", "empresa"];

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Activa",
  past_due: "Morosa",
  canceled: "Cancelada",
  trialing: "Prueba",
};

interface PlanRow {
  name: string;
  price: string;
  maxProducts: string;
  maxSalesPerMonth: string;
  maxStaff: string;
}

interface TenantDraft {
  plan: Plan;
  status: SubscriptionStatus;
}

function planRowsFrom(plans: PlanDef[]): Record<Plan, PlanRow> {
  const r = {} as Record<Plan, PlanRow>;
  for (const p of plans) {
    r[p.id] = {
      name: p.name,
      price: String(p.price),
      maxProducts: String(p.maxProducts),
      maxSalesPerMonth: String(p.maxSalesPerMonth),
      maxStaff: String(p.maxStaff),
    };
  }
  return r;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-CL");
  } catch {
    return iso;
  }
}

export default function AdminPanel() {
  const { profile } = useAuth();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("resumen");
  const [loading, setLoading] = useState(true);

  // Planes
  const [plans, setPlans] = useState<PlanDef[]>([]);
  const [rows, setRows] = useState<Record<Plan, PlanRow>>(() => planRowsFrom([]));
  const [savingPlan, setSavingPlan] = useState<Plan | null>(null);

  // Métricas + negocios
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantDrafts, setTenantDrafts] = useState<Record<string, TenantDraft>>({});
  const [savingTenant, setSavingTenant] = useState<string | null>(null);

  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [bootMsg, setBootMsg] = useState("");

  const loadPlans = useCallback(async () => {
    const p = await getPlans();
    setPlans(p);
    setRows(planRowsFrom(p));
  }, []);

  const loadAdminData = useCallback(async () => {
    const [s, t] = await Promise.all([getAdminStats(), listTenants()]);
    setStats(s);
    setTenants(t);
    const drafts: Record<string, TenantDraft> = {};
    for (const x of t) drafts[x.id] = { plan: x.plan, status: x.subscriptionStatus };
    setTenantDrafts(drafts);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const adminOk = await isPlatformAdmin();
      setAdmin(adminOk);
      await loadPlans();
      if (adminOk) await loadAdminData();
      setLoading(false);
    })();
  }, [loadPlans, loadAdminData]);

  async function bootstrap() {
    setBootMsg("");
    const r = await bootstrapPlatformAdmin();
    if (r.ok) {
      setBootMsg(r.message);
      setAdmin(true);
      await loadAdminData();
    } else {
      setBootMsg(r.message);
    }
  }

  async function savePlan(id: Plan) {
    const row = rows[id];
    if (!row) return;
    setSavingPlan(id);
    setMsg("");
    setError("");

    const price = normalizeCLP(row.price);
    const maxProducts = parseInt(row.maxProducts || "0", 10);
    const maxSales = parseInt(row.maxSalesPerMonth || "0", 10);
    const maxStaff = parseInt(row.maxStaff || "0", 10);

    if (price <= 0) {
      setError("Ingresa un precio válido mayor que 0.");
      setSavingPlan(null);
      return;
    }
    if ([maxProducts, maxSales, maxStaff].some((n) => isNaN(n) || n < 0)) {
      setError("Los límites deben ser números >= 0 (0 = ilimitado).");
      setSavingPlan(null);
      return;
    }

    const r = await updatePlan(id, {
      price,
      name: row.name.trim() || undefined,
      maxProducts,
      maxSalesPerMonth: maxSales,
      maxStaff,
    });

    if (r.ok) {
      await syncPlanLimits();
      setMsg(`Plan ${row.name || id} actualizado ✓`);
      await loadPlans();
    } else {
      setError(r.message);
    }
    setSavingPlan(null);
  }

  async function saveTenant(id: string) {
    const d = tenantDrafts[id];
    if (!d) return;
    setSavingTenant(id);
    setMsg("");
    setError("");
    const r = await updateTenant(id, { plan: d.plan, subscriptionStatus: d.status });
    if (r.ok) {
      setMsg("Negocio actualizado ✓");
      await loadAdminData();
    } else {
      setError(r.message);
    }
    setSavingTenant(null);
  }

  if (loading) {
    return <div className="text-white/50">Cargando administración…</div>;
  }

  if (admin === false) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-6 text-2xl font-semibold text-white">Administración</h1>
        <div className="card p-6">
          <p className="text-white/70">No tienes permisos de administrador de plataforma.</p>
          {profile?.role === "owner" && (
            <>
              <p className="mt-2 text-sm text-white/40">
                Como dueño, puedes activar el acceso de administrador (solo el primer dueño lo
                obtiene).
              </p>
              <button className="btn-primary mt-4" onClick={bootstrap}>
                Activar acceso administrador
              </button>
              {bootMsg && <p className="mt-2 text-sm text-accent">{bootMsg}</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "resumen", label: "Resumen", icon: "monitoring" },
    { id: "planes", label: "Planes", icon: "sell" },
    { id: "negocios", label: "Negocios", icon: "storefront" },
  ];

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold text-white">Administración del SaaS</h1>
      <p className="mb-6 text-sm text-white/40">
        Control de planes, precios, límites y negocios de la plataforma.
      </p>

      {msg && <p className="mb-4 text-sm text-accent">{msg}</p>}
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "btn-primary" : "btn-ghost"}
            onClick={() => {
              setTab(t.id);
              setMsg("");
              setError("");
            }}
          >
            <span className="material-symbols-rounded align-middle text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <section>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Kpi label="Negocios" value={String(stats?.totalTenants ?? 0)} />
            <Kpi label="Activos" value={String(stats?.activeTenants ?? 0)} />
            <Kpi label="Morosos" value={String(stats?.pastDueTenants ?? 0)} />
            <Kpi label="Cancelados" value={String(stats?.canceledTenants ?? 0)} />
            <Kpi label="En prueba" value={String(stats?.trialingTenants ?? 0)} />
            <Kpi label="Usuarios (staff)" value={String(stats?.totalStaff ?? 0)} />
            <Kpi label="Ventas totales" value={String(stats?.salesTotal ?? 0)} />
            <Kpi label="Ventas del mes" value={String(stats?.salesMonth ?? 0)} />
            <Kpi label="Boletas" value={String(stats?.boletasTotal ?? 0)} />
            <Kpi label="Vencen en 7d" value={String(stats?.expiring7d ?? 0)} warn={Boolean(stats?.expiring7d)} />
            <Kpi label="Alertas límite" value={String(stats?.limitAlerts ?? 0)} warn={Boolean(stats?.limitAlerts)} />
          </div>

          <div className="card mt-6 p-5">
            <h3 className="mb-3 font-semibold text-white">Distribución por plan</h3>
            <div className="grid grid-cols-3 gap-4">
              {PLAN_ORDER.map((p) => (
                <div key={p} className="rounded-xl bg-white/5 p-4">
                  <p className="capitalize text-white/50">{p}</p>
                  <p className="text-2xl font-semibold text-white">
                    {stats?.tenantsByPlan?.[p] ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === "planes" && (
        <section className="space-y-4">
          {plans.map((p) => {
            const row = rows[p.id];
            if (!row) return null;
            return (
              <div key={p.id} className="card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold capitalize text-white">{p.id}</h3>
                  <span className="text-sm text-accent">
                    {formatPlanPrice(normalizeCLP(row.price))}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Nombre">
                    <input
                      className="input"
                      value={row.name}
                      onChange={(e) =>
                        setRows((r) => ({ ...r, [p.id]: { ...r[p.id], name: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Precio mensual (CLP)">
                    <input
                      className="input"
                      inputMode="numeric"
                      value={row.price}
                      onChange={(e) =>
                        setRows((r) => ({ ...r, [p.id]: { ...r[p.id], price: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Máx. productos (0 = ilimitado)">
                    <input
                      className="input"
                      inputMode="numeric"
                      value={row.maxProducts}
                      onChange={(e) =>
                        setRows((r) => ({ ...r, [p.id]: { ...r[p.id], maxProducts: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Máx. boletas/mes (0 = ilimitado)">
                    <input
                      className="input"
                      inputMode="numeric"
                      value={row.maxSalesPerMonth}
                      onChange={(e) =>
                        setRows((r) => ({
                          ...r,
                          [p.id]: { ...r[p.id], maxSalesPerMonth: e.target.value },
                        }))
                      }
                    />
                  </Field>
                  <Field label="Máx. usuarios (0 = ilimitado)">
                    <input
                      className="input"
                      inputMode="numeric"
                      value={row.maxStaff}
                      onChange={(e) =>
                        setRows((r) => ({ ...r, [p.id]: { ...r[p.id], maxStaff: e.target.value } }))
                      }
                    />
                  </Field>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    className="btn-primary"
                    disabled={savingPlan === p.id}
                    onClick={() => savePlan(p.id)}
                  >
                    {savingPlan === p.id ? "Guardando…" : "Guardar plan"}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {tab === "negocios" && (
        <section>
          {tenants.length === 0 ? (
            <div className="card p-6 text-white/50">Aún no hay negocios registrados.</div>
          ) : (
            <div className="space-y-3">
              {tenants.map((t) => {
                const d = tenantDrafts[t.id];
                return (
                  <div key={t.id} className="card p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white">{t.name}</p>
                        <p className="text-xs text-white/40">
                          {t.ownerEmail ?? "sin email"} · {t.staffCount} usuario(s) · creado{" "}
                          {fmtDate(t.createdAt)}
                        </p>
                      </div>
                      <span className="text-xs text-white/40">vence {fmtDate(t.subscriptionEndsAt)}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <Field label="Plan">
                        <select
                          className="input"
                          value={d?.plan ?? t.plan}
                          onChange={(e) =>
                            setTenantDrafts((r) => ({
                              ...r,
                              [t.id]: { ...r[t.id], plan: e.target.value as Plan },
                            }))
                          }
                        >
                          {PLAN_ORDER.map((p) => (
                            <option key={p} value={p} className="bg-ink-soft text-white">
                              {p}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Estado de suscripción">
                        <select
                          className="input"
                          value={d?.status ?? t.subscriptionStatus}
                          onChange={(e) =>
                            setTenantDrafts((r) => ({
                              ...r,
                              [t.id]: { ...r[t.id], status: e.target.value as SubscriptionStatus },
                            }))
                          }
                        >
                          {(Object.keys(STATUS_LABEL) as SubscriptionStatus[]).map((s) => (
                            <option key={s} value={s} className="bg-ink-soft text-white">
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="flex items-end">
                        <button
                          className="btn-primary w-full"
                          disabled={savingTenant === t.id}
                          onClick={() => saveTenant(t.id)}
                        >
                          {savingTenant === t.id ? "Guardando…" : "Guardar"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={"card p-4" + (warn ? " ring-1 ring-amber-400/60" : "")}>
      <p className="text-xs text-white/40">{label}</p>
      <p className={"text-2xl font-semibold " + (warn ? "text-amber-300" : "text-white")}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
