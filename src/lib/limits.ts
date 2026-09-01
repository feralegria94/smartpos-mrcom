// Límites por plan (enforcement offline-first).
// Fuente de verdad: public.plans (Supabase) → sincronizado a localStorage vía
// syncPlanLimits(); el fallback local garantiza funcionamiento offline.
// El POS opera 100% offline (localStorage); el enforcement se hace en el
// frontend contando datos locales, más el estado de suscripción del tenant.

import type { Plan, Tenant } from "../types";
import { getProducts, getSales } from "./store";
import { getPlans } from "./plans";

export interface PlanLimits {
  maxProducts: number; // 0 = ilimitado
  maxSalesPerMonth: number; // 0 = ilimitado
  maxStaff: number; // 0 = ilimitado
}

const DEFAULT_LIMITS: Record<Plan, PlanLimits> = {
  basico: { maxProducts: 50, maxSalesPerMonth: 200, maxStaff: 2 },
  pro: { maxProducts: 500, maxSalesPerMonth: 5000, maxStaff: 3 },
  empresa: { maxProducts: 0, maxSalesPerMonth: 0, maxStaff: 0 },
};

const CACHE_KEY = "smartpos:plan_limits";

export const PLAN_NAMES: Record<Plan, string> = {
  basico: "Básico",
  pro: "Pro",
  empresa: "Empresa",
};

function readCache(): Record<Plan, PlanLimits> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Record<Plan, PlanLimits>>;
    if (!d?.basico || !d?.pro || !d?.empresa) return null;
    return d as Record<Plan, PlanLimits>;
  } catch {
    return null;
  }
}

/** Sincroniza límites desde public.plans a localStorage (se llama al iniciar la app). */
export async function syncPlanLimits(): Promise<void> {
  try {
    const plans = await getPlans();
    const map: Record<Plan, PlanLimits> = {
      basico: { ...DEFAULT_LIMITS.basico },
      pro: { ...DEFAULT_LIMITS.pro },
      empresa: { ...DEFAULT_LIMITS.empresa },
    };
    for (const p of plans) {
      map[p.id] = { maxProducts: p.maxProducts, maxSalesPerMonth: p.maxSalesPerMonth, maxStaff: p.maxStaff };
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* sin almacenamiento / sin red: mantener fallback */
  }
}

export function getPlanLimits(plan?: string | null): PlanLimits {
  const src = readCache() ?? DEFAULT_LIMITS;
  if (plan === "pro") return src.pro;
  if (plan === "empresa") return src.empresa;
  return src.basico;
}

export function isUnlimited(n: number): boolean {
  return n === 0;
}

/** Productos activos actuales del tenant. */
export function countProducts(tenantId: string): number {
  return getProducts(tenantId).length;
}

/** Ventas del mes calendario actual. */
export function countSalesThisMonth(tenantId: string): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return getSales(tenantId).filter((s) => {
    const d = new Date(s.created_at);
    return d.getFullYear() === y && d.getMonth() === m;
  }).length;
}

/** ¿Queda espacio para agregar productos? Devuelve límite alcanzado o null. */
export function canAddProduct(tenantId: string, plan?: string | null): { ok: boolean; limit?: number } {
  const { maxProducts } = getPlanLimits(plan);
  if (isUnlimited(maxProducts)) return { ok: true };
  const used = countProducts(tenantId);
  return used >= maxProducts ? { ok: false, limit: maxProducts } : { ok: true };
}

/** ¿Queda espacio para una venta más este mes? */
export function canAddSale(tenantId: string, plan?: string | null): { ok: boolean; limit?: number; used?: number } {
  const { maxSalesPerMonth } = getPlanLimits(plan);
  if (isUnlimited(maxSalesPerMonth)) return { ok: true };
  const used = countSalesThisMonth(tenantId);
  return used >= maxSalesPerMonth
    ? { ok: false, limit: maxSalesPerMonth, used }
    : { ok: true, used };
}

/** ¿Queda espacio para invitar un staff más? (staff_count = nº de perfiles del tenant) */
export function canAddStaff(staffCount: number, plan?: string | null): { ok: boolean; limit?: number } {
  const { maxStaff } = getPlanLimits(plan);
  if (isUnlimited(maxStaff)) return { ok: true };
  return staffCount >= maxStaff ? { ok: false, limit: maxStaff } : { ok: true };
}

/** Suscripción activa: no vencida y no cancelada. */
export function isSubscriptionActive(tenant?: Tenant | null): boolean {
  if (!tenant) return false;
  if (tenant.subscription_status === "canceled") return false;
  if (tenant.subscription_ends_at) {
    return new Date(tenant.subscription_ends_at).getTime() > Date.now();
  }
  // Sin fecha de fin => considerada activa (fase previa a pasarela).
  return tenant.subscription_status !== "past_due";
}