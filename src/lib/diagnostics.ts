// Diagnóstico de salud de SmartPOS (offline-first).
// Utilidad de validación para confirmar que la app funciona correctamente:
// almacenamiento local, integridad de datos, límites del plan, suscripción,
// configuración de boleta y conectividad con el backend.
//
// El POS opera offline (localStorage), así que la mayoría de checks son
// locales; la conectividad con Supabase se reporta como "modo offline"
// cuando no responde, sin bloquear el resto del diagnóstico.

import type { Tenant } from "../types";
import { supabase } from "./supabase";
import {
  getProducts,
  getCustomers,
  getSales,
} from "./store";
import {
  getPlanLimits,
  countProducts,
  countSalesThisMonth,
  isUnlimited,
  isSubscriptionActive,
} from "./limits";
import { loadReceiptConfig } from "./receipt";

export type CheckStatus = "ok" | "warn" | "error";

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DiagnosticsReport {
  checks: DiagnosticCheck[];
  summary: { ok: number; warn: number; error: number };
  healthy: boolean;
  online: boolean;
  latencyMs?: number;
}

const STORAGE_KEYS = (tenantId: string) => [
  `smartpos:data:${tenantId}`,
  `smartpos:draft:${tenantId}`,
  `smartpos_receipt_${tenantId}`,
];

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** Bytes usados por este tenant en localStorage (datos + borrador + boleta). */
export function storageUsage(tenantId: string): { bytes: number; keys: number } {
  let bytes = 0;
  let keys = 0;
  for (const k of STORAGE_KEYS(tenantId)) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) {
        bytes += k.length + v.length;
        keys += 1;
      }
    } catch {
      /* ignore */
    }
  }
  return { bytes, keys };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function checkLocalStorage(): DiagnosticCheck {
  try {
    const k = "__smartpos_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return { id: "storage", label: "Almacenamiento local", status: "ok", detail: "localStorage disponible" };
  } catch {
    return {
      id: "storage",
      label: "Almacenamiento local",
      status: "error",
      detail: "localStorage no disponible (modo privado o bloqueado)",
    };
  }
}

/** Integridad de los datos offline del tenant: arrays válidos, sin ids duplicados. */
export function checkOfflineData(tenantId: string): DiagnosticCheck {
  const products = getProducts(tenantId);
  const customers = getCustomers(tenantId);
  const sales = getSales(tenantId);

  if (!Array.isArray(products) || !Array.isArray(customers) || !Array.isArray(sales)) {
    return { id: "data", label: "Datos locales", status: "error", detail: "Estructura de datos corrupta" };
  }

  const dupProducts = hasDupIds(products);
  const dupCustomers = hasDupIds(customers);
  const dupSales = hasDupIds(sales);

  if (dupProducts || dupCustomers || dupSales) {
    return {
      id: "data",
      label: "Datos locales",
      status: "warn",
      detail: "Se detectaron ids duplicados en los datos locales",
    };
  }

  return {
    id: "data",
    label: "Datos locales",
    status: "ok",
    detail: `${products.length} productos · ${customers.length} clientes · ${sales.length} boletas`,
  };
}

function hasDupIds(list: { id: string }[]): boolean {
  const seen = new Set<string>();
  for (const item of list) {
    if (seen.has(item.id)) return true;
    seen.add(item.id);
  }
  return false;
}

function limitCheck(
  id: string,
  label: string,
  used: number,
  limit: number
): DiagnosticCheck {
  if (isUnlimited(limit)) {
    return { id, label, status: "ok", detail: `${used} usados · ilimitado` };
  }
  const pct = Math.round((used / limit) * 100);
  if (used >= limit) {
    return { id, label, status: "error", detail: `${used}/${limit} · límite alcanzado` };
  }
  if (pct >= 80) {
    return { id, label, status: "warn", detail: `${used}/${limit} · ${pct}% usado` };
  }
  return { id, label, status: "ok", detail: `${used}/${limit} · ${pct}% usado` };
}

export function checkLimits(tenantId: string, plan?: string | null): DiagnosticCheck[] {
  const { maxProducts, maxSalesPerMonth } = getPlanLimits(plan);
  return [
    limitCheck("limit-products", "Productos", countProducts(tenantId), maxProducts),
    limitCheck("limit-sales", "Boletas del mes", countSalesThisMonth(tenantId), maxSalesPerMonth),
  ];
}

export function checkSubscription(tenant: Tenant | null): DiagnosticCheck {
  if (!tenant) {
    return { id: "subscription", label: "Suscripción", status: "warn", detail: "Sin negocio cargado" };
  }
  if (isSubscriptionActive(tenant)) {
    const detail = tenant.subscription_ends_at
      ? `Activa hasta ${new Date(tenant.subscription_ends_at).toLocaleDateString("es-CL")}`
      : "Activa (sin fecha de vencimiento)";
    return { id: "subscription", label: "Suscripción", status: "ok", detail };
  }
  return { id: "subscription", label: "Suscripción", status: "error", detail: "Vencida o cancelada" };
}

export function checkReceipt(tenantId: string): DiagnosticCheck {
  try {
    const cfg = loadReceiptConfig(tenantId);
    if (cfg.showLogo && !cfg.logo) {
      return {
        id: "receipt",
        label: "Boleta configurable",
        status: "warn",
        detail: "Logo habilitado pero sin imagen cargada",
      };
    }
    return { id: "receipt", label: "Boleta configurable", status: "ok", detail: "Configuración válida" };
  } catch {
    return { id: "receipt", label: "Boleta configurable", status: "error", detail: "Configuración ilegible" };
  }
}

/** Ping real al backend Supabase (sin bloquear el diagnóstico offline). */
export async function pingSupabase(timeoutMs = 5000): Promise<{ online: boolean; latencyMs?: number }> {
  const started = performance.now();
  try {
    const { error } = await withTimeout(
      Promise.resolve(supabase.from("tenants").select("id").limit(1)),
      timeoutMs
    );
    if (error) return { online: false };
    return { online: true, latencyMs: Math.round(performance.now() - started) };
  } catch {
    return { online: false };
  }
}

export async function runDiagnostics(
  tenant: Tenant | null,
  opts?: { staffCount?: number }
): Promise<DiagnosticsReport> {
  const tenantId = tenant?.id ?? "";
  const checks: DiagnosticCheck[] = [
    checkLocalStorage(),
    checkOfflineData(tenantId),
    ...checkLimits(tenantId, tenant?.plan),
  ];

  // Staff: solo si hay un conteo real (lo provee la página de diagnóstico).
  if (typeof opts?.staffCount === "number") {
    const { maxStaff } = getPlanLimits(tenant?.plan);
    checks.push(limitCheck("limit-staff", "Usuarios del equipo", opts.staffCount, maxStaff));
  }

  checks.push(checkSubscription(tenant));
  checks.push(checkReceipt(tenantId));

  const { online, latencyMs } = await pingSupabase();
  checks.push({
    id: "backend",
    label: "Conexión con el backend",
    status: online ? "ok" : "warn",
    detail: online ? `Conectado · ${latencyMs ?? "?"} ms` : "Sin conexión · operando en modo offline",
  });

  const summary = { ok: 0, warn: 0, error: 0 };
  for (const c of checks) summary[c.status] += 1;

  return {
    checks,
    summary,
    healthy: summary.error === 0,
    online,
    latencyMs,
  };
}
