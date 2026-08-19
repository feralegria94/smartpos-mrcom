// Límites por plan (enforcement offline-first).
// Fuente de verdad: supabase/schema.sql → public.plan_limits(p_plan)
// El POS opera 100% offline (localStorage); el enforcement se hace en el
// frontend contando datos locales, más el estado de suscripción del tenant.

import type { Plan, Tenant } from "../types";
import { getProducts, getSales } from "./store";

export interface PlanLimits {
  maxProducts: number; // 0 = ilimitado
  maxSalesPerMonth: number; // 0 = ilimitado
  maxStaff: number; // 0 = ilimitado
}

const LIMITS: Record<Plan, PlanLimits> = {
  basico: { maxProducts: 50, maxSalesPerMonth: 200, maxStaff: 2 },
  pro: { maxProducts: 500, maxSalesPerMonth: 5000, maxStaff: 3 },
  empresa: { maxProducts: 0, maxSalesPerMonth: 0, maxStaff: 0 },
};

export const PLAN_NAMES: Record<Plan, string> = {
  basico: "Básico",
  pro: "Pro",
  empresa: "Empresa",
};

export function getPlanLimits(plan?: string | null): PlanLimits {
  if (plan === "pro") return LIMITS.pro;
  if (plan === "empresa") return LIMITS.empresa;
  return LIMITS.basico;
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