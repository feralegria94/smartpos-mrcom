// Capa de datos OFFLINE (localStorage), estilo Moon POS.
// El login online (Supabase) sigue siendo la "puerta" de registro,
// pero el POS opera 100% offline: ventas, clientes y productos viven
// en localStorage, aislados por tenant.

export interface LocalProduct {
  id: string;
  name: string;
  price: number;
  category: string | null;
  active: boolean;
  created_at: string;
}

export interface LocalCustomer {
  id: string;
  name: string;
  created_at: string;
}

export interface LocalSaleItem {
  description: string;
  price: number;
  qty: number;
}

export interface LocalSale {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  total: number;
  items: LocalSaleItem[];
  created_at: string;
}

export interface TenantConfig {
  name?: string;
  rut?: string;
  address?: string;
  phone?: string;
  email?: string;
  plan?: string;
}

interface TenantData {
  products: LocalProduct[];
  customers: LocalCustomer[];
  sales: LocalSale[];
  config: TenantConfig;
}

const PREFIX = "smartpos:data:";

function emptyData(): TenantData {
  return { products: [], customers: [], sales: [], config: {} };
}

function read(tenantId: string): TenantData {
  try {
    const raw = localStorage.getItem(PREFIX + tenantId);
    if (!raw) return emptyData();
    const d = JSON.parse(raw);
    return { ...emptyData(), ...d };
  } catch {
    return emptyData();
  }
}

function write(tenantId: string, d: TenantData): void {
  try {
    localStorage.setItem(PREFIX + tenantId, JSON.stringify(d));
  } catch {
    /* sin almacenamiento: ignorar */
  }
}

export function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Productos ───────────────────────────────────────────
export function getProducts(tenantId: string): LocalProduct[] {
  return read(tenantId).products.filter((p) => p.active);
}
export function addProduct(
  tenantId: string,
  name: string,
  price: number,
  category: string | null
): LocalProduct {
  const d = read(tenantId);
  const p: LocalProduct = {
    id: uid(),
    name,
    price,
    category,
    active: true,
    created_at: new Date().toISOString(),
  };
  d.products.push(p);
  write(tenantId, d);
  return p;
}
export function setProductActive(tenantId: string, id: string, active: boolean): void {
  const d = read(tenantId);
  const p = d.products.find((x) => x.id === id);
  if (p) {
    p.active = active;
    write(tenantId, d);
  }
}

// ── Clientes ────────────────────────────────────────────
export function getCustomers(tenantId: string): LocalCustomer[] {
  return read(tenantId).customers;
}
export function addCustomer(tenantId: string, name: string): LocalCustomer {
  const d = read(tenantId);
  const c: LocalCustomer = { id: uid(), name, created_at: new Date().toISOString() };
  d.customers.push(c);
  write(tenantId, d);
  return c;
}
export function deleteCustomer(tenantId: string, id: string): void {
  const d = read(tenantId);
  d.customers = d.customers.filter((c) => c.id !== id);
  write(tenantId, d);
}

// ── Ventas ──────────────────────────────────────────────
export function getSales(tenantId: string): LocalSale[] {
  return read(tenantId).sales;
}
export function addSale(
  tenantId: string,
  sale: Omit<LocalSale, "id" | "created_at">
): LocalSale {
  const d = read(tenantId);
  const s: LocalSale = { ...sale, id: uid(), created_at: new Date().toISOString() };
  d.sales.unshift(s);
  write(tenantId, d);
  return s;
}
export function deleteSale(tenantId: string, id: string): void {
  const d = read(tenantId);
  d.sales = d.sales.filter((s) => s.id !== id);
  write(tenantId, d);
}

// ── Config del tenant (local) ───────────────────────────
export function getConfig(tenantId: string): TenantConfig {
  return read(tenantId).config;
}
export function setConfig(tenantId: string, patch: Partial<TenantConfig>): void {
  const d = read(tenantId);
  d.config = { ...d.config, ...patch };
  write(tenantId, d);
}

// ── Utilidad: limpiar todos los datos locales de un tenant ──
export function clearTenantData(tenantId: string): void {
  try {
    localStorage.removeItem(PREFIX + tenantId);
  } catch {
    /* ignore */
  }
}
