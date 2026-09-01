// Capa de datos de planes y administración del SaaS.
// Fuente de verdad: public.plans + RPCs admin (security definer).
// Si Supabase falla, se usa FALLBACK local para no romper onboarding/settings.

import { supabase } from "./supabase";
import type { Plan, SubscriptionStatus } from "../types";

export interface PlanDef {
  id: Plan;
  name: string;
  price: number; // CLP, entero
  maxProducts: number; // 0 = ilimitado
  maxSalesPerMonth: number; // 0 = ilimitado
  maxStaff: number; // 0 = ilimitado
}

export const FALLBACK_PLANS: PlanDef[] = [
  { id: "basico", name: "Básico", price: 14990, maxProducts: 50, maxSalesPerMonth: 200, maxStaff: 2 },
  { id: "pro", name: "Pro", price: 29990, maxProducts: 500, maxSalesPerMonth: 5000, maxStaff: 3 },
  { id: "empresa", name: "Empresa", price: 49990, maxProducts: 0, maxSalesPerMonth: 0, maxStaff: 0 },
];

export interface AdminStats {
  totalTenants: number;
  activeTenants: number;
  pastDueTenants: number;
  canceledTenants: number;
  trialingTenants: number;
  tenantsByPlan: Record<Plan, number>;
  totalStaff: number;
  salesTotal: number;
  salesMonth: number;
  boletasTotal: number;
  expiring7d: number;
  limitAlerts: number;
}

export interface TenantRow {
  id: string;
  name: string;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  createdAt: string;
  staffCount: number;
  ownerEmail: string | null;
}

export function formatPlanPrice(n: number): string {
  return `$${n.toLocaleString("es-CL")}/mes`;
}

function mapPlan(row: {
  id: Plan;
  name: string;
  price: number | string;
  max_products?: number | string | null;
  max_sales_per_month?: number | string | null;
  max_staff?: number | string | null;
}): PlanDef {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    maxProducts: Number(row.max_products ?? 0),
    maxSalesPerMonth: Number(row.max_sales_per_month ?? 0),
    maxStaff: Number(row.max_staff ?? 0),
  };
}

/** Lee los planes desde Supabase. Devuelve fallback si hay error. */
export async function getPlans(): Promise<PlanDef[]> {
  try {
    const { data, error } = await supabase.rpc("get_plans");
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_PLANS;
    return (data as Parameters<typeof mapPlan>[0][]).map(mapPlan);
  } catch {
    return FALLBACK_PLANS;
  }
}

/** ¿El usuario autenticado es administrador de plataforma (MR.COM)? */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_platform_admin");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** Bootstrap: el primer owner que lo invoca se vuelve superadmin. */
export async function bootstrapPlatformAdmin(): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.rpc("bootstrap_platform_admin");
  if (error) return { ok: false, message: error.message };
  return (data as { ok: boolean; message: string }) ?? { ok: false, message: "Sin respuesta" };
}

/** Actualiza un plan (precio + nombre + límites). Solo superadmin. */
export async function updatePlan(
  id: Plan,
  patch: { price?: number; name?: string; maxProducts?: number; maxSalesPerMonth?: number; maxStaff?: number }
): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.rpc("admin_update_plan", {
    p_plan: id,
    p_price: patch.price ?? null,
    p_name: patch.name ?? null,
    p_max_products: patch.maxProducts ?? null,
    p_max_sales_per_month: patch.maxSalesPerMonth ?? null,
    p_max_staff: patch.maxStaff ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return (data as { ok: boolean; message: string }) ?? { ok: false, message: "Sin respuesta" };
}

/** Métricas globales del SaaS. Devuelve null si no hay permiso/error. */
export async function getAdminStats(): Promise<AdminStats | null> {
  const { data, error } = await supabase.rpc("admin_stats");
  if (error || !data || (data as { ok?: boolean }).ok === false) return null;
  const d = data as Record<string, unknown>;
  return {
    totalTenants: Number(d.total_tenants ?? 0),
    activeTenants: Number(d.active_tenants ?? 0),
    pastDueTenants: Number(d.past_due_tenants ?? 0),
    canceledTenants: Number(d.canceled_tenants ?? 0),
    trialingTenants: Number(d.trialing_tenants ?? 0),
    tenantsByPlan: (d.tenants_by_plan as Record<Plan, number>) ?? { basico: 0, pro: 0, empresa: 0 },
    totalStaff: Number(d.total_staff ?? 0),
    salesTotal: Number(d.sales_total ?? 0),
    salesMonth: Number(d.sales_month ?? 0),
    boletasTotal: Number(d.boletas_total ?? 0),
    expiring7d: Number(d.expiring_7d ?? 0),
    limitAlerts: Number(d.limit_alerts ?? 0),
  };
}

/** Listado de negocios (solo superadmin). */
export async function listTenants(): Promise<TenantRow[]> {
  const { data, error } = await supabase.rpc("admin_list_tenants");
  if (error || !Array.isArray(data)) return [];
  return (data as {
    id: string;
    name: string;
    plan: Plan;
    subscription_status: SubscriptionStatus;
    subscription_ends_at: string | null;
    created_at: string;
    staff_count: number | string;
    owner_email: string | null;
  }[]).map((t) => ({
    id: t.id,
    name: t.name,
    plan: t.plan,
    subscriptionStatus: t.subscription_status,
    subscriptionEndsAt: t.subscription_ends_at,
    createdAt: t.created_at,
    staffCount: Number(t.staff_count),
    ownerEmail: t.owner_email,
  }));
}

/** Actualiza plan/estado de un negocio (solo superadmin). */
export async function updateTenant(
  id: string,
  patch: {
    plan?: Plan;
    subscriptionStatus?: SubscriptionStatus;
    subscriptionEndsAt?: string | null;
    clearEndsAt?: boolean;
  }
): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.rpc("admin_update_tenant", {
    p_tenant_id: id,
    p_plan: patch.plan ?? null,
    p_subscription_status: patch.subscriptionStatus ?? null,
    p_subscription_ends_at: patch.subscriptionEndsAt ?? null,
    p_clear_ends_at: patch.clearEndsAt ?? false,
  });
  if (error) return { ok: false, message: error.message };
  return (data as { ok: boolean; message: string }) ?? { ok: false, message: "Sin respuesta" };
}
