import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import { getProducts, getCustomers, getSales } from "../lib/store";
import { formatCLP } from "../lib/format";
import { getPlanLimits, isUnlimited, isSubscriptionActive, PLAN_NAMES } from "../lib/limits";
import { latestVersion } from "../lib/changelog";
import {
  runDiagnostics,
  storageUsage,
  formatBytes,
  type DiagnosticsReport,
  type CheckStatus,
} from "../lib/diagnostics";
import type { Plan } from "../types";

const STATUS_STYLE: Record<CheckStatus, string> = {
  ok: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  error: "bg-red-500/15 text-red-300 border border-red-500/30",
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: "OK",
  warn: "Aviso",
  error: "Error",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  );
}

function Progress({ used, limit }: { used: number; limit: number }) {
  if (isUnlimited(limit)) {
    return <span className="text-sm text-white/60">Ilimitado</span>;
  }
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-accent";
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 text-right text-xs tabular-nums text-white/60">
        {used}/{limit}
      </span>
    </div>
  );
}

function planOf(plan?: string | null): Plan {
  return (plan ?? "basico") as Plan;
}

export default function Health() {
  const { tenant, profile } = useAuth();
  const tenantId = tenant?.id ?? "";
  const plan = planOf(tenant?.plan);

  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffCount, setStaffCount] = useState<number | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    const rep = await runDiagnostics(tenant, { staffCount: staffCount ?? undefined });
    setReport(rep);
    setLoading(false);
  }, [tenant, staffCount]);

  // Carga el nº de usuarios del equipo (para el límite de staff).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!profile?.tenant_id) return;
      try {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", profile.tenant_id);
        if (alive && typeof count === "number") setStaffCount(count);
      } catch {
        /* sin backend: el check de staff queda fuera */
      }
    })();
    return () => {
      alive = false;
    };
  }, [profile?.tenant_id]);

  useEffect(() => {
    run();
  }, [run]);

  // Métricas del negocio (locales, offline).
  const sales = getSales(tenantId);
  const products = getProducts(tenantId);
  const customers = getCustomers(tenantId);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const today = sales.filter((s) => new Date(s.created_at) >= startOfDay);
  const month = sales.filter((s) => new Date(s.created_at) >= startOfMonth);
  const totalToday = today.reduce((a, s) => a + s.total, 0);
  const totalMonth = month.reduce((a, s) => a + s.total, 0);

  const top: Record<string, number> = {};
  month.forEach((s) => s.items.forEach((i) => (top[i.description] = (top[i.description] || 0) + i.qty)));
  const topProduct = Object.entries(top).sort((a, b) => b[1] - a[1])[0];

  const limits = getPlanLimits(tenant?.plan);
  const usage = storageUsage(tenantId);
  const subActive = isSubscriptionActive(tenant);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Diagnóstico</h1>
          <p className="text-sm text-white/50">Estado del sistema y métricas del negocio.</p>
        </div>
        <button className="btn-primary" onClick={run} disabled={loading}>
          {loading ? "Verificando…" : "Re-ejecutar"}
        </button>
      </div>

      {/* Resumen de salud */}
      {report && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div
            className={`card border p-5 ${
              report.healthy ? "border-emerald-500/30" : "border-red-500/30"
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-white/40">Salud general</p>
            <p className={`mt-1 text-2xl font-bold ${report.healthy ? "text-emerald-300" : "text-red-300"}`}>
              {report.healthy ? "Operativo" : "Requiere atención"}
            </p>
            <p className="mt-1 text-xs text-white/40">
              {report.summary.ok} OK · {report.summary.warn} avisos · {report.summary.error} errores
            </p>
          </div>
          <div className="card border border-white/10 p-5">
            <p className="text-xs uppercase tracking-wide text-white/40">Backend</p>
            <p className={`mt-1 text-2xl font-bold ${report.online ? "text-emerald-300" : "text-amber-300"}`}>
              {report.online ? "En línea" : "Offline"}
            </p>
            <p className="mt-1 text-xs text-white/40">
              {report.online ? `Latencia ${report.latencyMs ?? "?"} ms` : "Operando en modo local"}
            </p>
          </div>
          <div className="card border border-white/10 p-5">
            <p className="text-xs uppercase tracking-wide text-white/40">Almacenamiento local</p>
            <p className="mt-1 text-2xl font-bold text-white">{formatBytes(usage.bytes)}</p>
            <p className="mt-1 text-xs text-white/40">{usage.keys} claves activas</p>
          </div>
        </div>
      )}

      {/* Métricas del negocio */}
      <h2 className="mb-3 text-lg font-semibold text-white">Métricas del negocio</h2>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ventas hoy" value={formatCLP(totalToday)} hint={`${today.length} boletas`} />
        <Stat label="Ventas del mes" value={formatCLP(totalMonth)} hint={`${month.length} boletas`} />
        <Stat label="Productos activos" value={String(products.length)} />
        <Stat
          label="Producto top (mes)"
          value={topProduct ? topProduct[0] : "—"}
          hint={topProduct ? `${topProduct[1]} unidades` : undefined}
        />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clientes" value={String(customers.length)} />
        <Stat label="Boletas totales" value={String(sales.length)} />
        <Stat label="Ticket promedio (mes)" value={month.length ? formatCLP(Math.round(totalMonth / month.length)) : "—"} />
        <Stat label="Versión" value={`v${latestVersion()}`} hint="SmartPOS" />
      </div>

      {/* Uso del plan */}
      <h2 className="mb-3 text-lg font-semibold text-white">Uso del plan</h2>
      <div className="card mb-6 space-y-4 p-5">
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-white/70">Productos</span>
            <span className="text-xs text-white/40">{limits.maxProducts === 0 ? "Ilimitado" : `${limits.maxProducts} máx.`}</span>
          </div>
          <Progress used={products.length} limit={limits.maxProducts} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-white/70">Boletas este mes</span>
            <span className="text-xs text-white/40">{limits.maxSalesPerMonth === 0 ? "Ilimitado" : `${limits.maxSalesPerMonth} máx.`}</span>
          </div>
          <Progress used={month.length} limit={limits.maxSalesPerMonth} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-white/70">Usuarios del equipo</span>
            <span className="text-xs text-white/40">{limits.maxStaff === 0 ? "Ilimitado" : `${limits.maxStaff} máx.`}</span>
          </div>
          {staffCount === null ? (
            <span className="text-sm text-white/40">No disponible (sin backend)</span>
          ) : (
            <Progress used={staffCount} limit={limits.maxStaff} />
          )}
        </div>
      </div>

      {/* Suscripción */}
      <h2 className="mb-3 text-lg font-semibold text-white">Suscripción</h2>
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm font-semibold text-white">
            Plan {PLAN_NAMES[plan]} — {subActive ? "Activa" : "Inactiva"}
          </p>
          <p className="text-xs text-white/40">
            {tenant?.subscription_ends_at
              ? `Vence el ${new Date(tenant.subscription_ends_at).toLocaleDateString("es-CL")}`
              : "Sin fecha de vencimiento"}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            subActive ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
          }`}
        >
          {subActive ? "Al día" : "Renovar"}
        </span>
      </div>

      {/* Checks de diagnóstico */}
      <h2 className="mb-3 text-lg font-semibold text-white">Checks de validación</h2>
      <div className="card divide-y divide-white/5">
        {report?.checks.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm text-white">{c.label}</p>
              <p className="text-xs text-white/40">{c.detail}</p>
            </div>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status]}`}>
              {STATUS_LABEL[c.status]}
            </span>
          </div>
        ))}
        {!report && !loading && <p className="px-5 py-6 text-center text-sm text-white/40">Sin resultados.</p>}
        {loading && !report && <p className="px-5 py-6 text-center text-sm text-white/40">Verificando…</p>}
      </div>
    </div>
  );
}
