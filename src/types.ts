export type Plan = "basico" | "pro" | "empresa";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";
export type Role = "owner" | "admin" | "cashier";

export interface Tenant {
  id: string;
  name: string;
  business_name: string | null;
  rut: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  plan: Plan;
  subscription_status: SubscriptionStatus;
  subscription_ends_at: string | null;
  created_at: string;
  owner_id: string | null;
}

export interface Profile {
  id: string;
  tenant_id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  price: number;
  category: string | null;
  sku: string | null;
  active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface SaleItem {
  description: string;
  price: number;
  qty: number;
}

export interface Sale {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  customer_name: string | null;
  total: number;
  items: SaleItem[];
  created_by: string | null;
  created_at: string;
}
