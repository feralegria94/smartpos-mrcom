-- ============================================================================
--  SMARTPOS — Schema multi-tenant (Supabase)
--  Proyecto Supabase reusado: qtjcgbcqdhaubmdhqgxe
--  Aplicar con service_role (Dashboard SQL editor o supabase db CLI).
--  Modelo: Suscripción fija (planes: basico | pro | empresa)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- TENANTS (negocios / cuentas del SaaS)
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  business_name        text,
  rut                  text,
  address              text,
  phone                text,
  email                text,
  logo_url             text,
  plan                 text not null default 'basico'
                         check (plan in ('basico','pro','empresa')),
  subscription_status  text not null default 'active'
                         check (subscription_status in ('active','past_due','canceled','trialing')),
  subscription_ends_at timestamptz,
  created_at           timestamptz not null default now(),
  owner_id             uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- PROFILES (staff / usuarios de un tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'owner'
               check (role in ('owner','admin','cashier')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PRODUCTS (catálogo del tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  price      numeric(12,2) not null default 0,
  category   text,
  sku        text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CUSTOMERS (clientes del tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- SALES (boletas / transacciones)
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  customer_id   uuid references public.customers(id) on delete set null,
  customer_name text,
  total         numeric(12,2) not null default 0,
  items         jsonb not null default '[]'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
create index if not exists idx_products_tenant     on public.products(tenant_id);
create index if not exists idx_customers_tenant    on public.customers(tenant_id);
create index if not exists idx_sales_tenant_date   on public.sales(tenant_id, created_at desc);
create index if not exists idx_profiles_tenant     on public.profiles(tenant_id);

-- ---------------------------------------------------------------------------
-- HELPER: tenant del usuario autenticado (usado por RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tenants   enable row level security;
alter table public.profiles  enable row level security;
alter table public.products  enable row level security;
alter table public.customers enable row level security;
alter table public.sales     enable row level security;

-- TENANTS: el owner ve/modifica su tenant; staff del mismo tenant lo ve.
drop policy if exists tenants_isolation on public.tenants;
create policy tenants_isolation on public.tenants
  for all
  using (id = public.current_tenant_id())
  with check (id = public.current_tenant_id());

-- PROFILES: usuarios solo ven/modifican perfiles de su tenant.
drop policy if exists profiles_isolation on public.profiles;
create policy profiles_isolation on public.profiles
  for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- PRODUCTS / CUSTOMERS / SALES: aislados por tenant.
drop policy if exists products_isolation on public.products;
create policy products_isolation on public.products
  for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists customers_isolation on public.customers;
create policy customers_isolation on public.customers
  for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists sales_isolation on public.sales;
create policy sales_isolation on public.sales
  for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- TRIGGER: al registrarse, crear tenant + profile (owner)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant uuid;
begin
  insert into public.tenants (name, owner_id)
  values (
    coalesce(new.raw_user_meta_data->>'business_name', 'Mi Negocio'),
    new.id
  )
  returning id into new_tenant;

  insert into public.profiles (id, tenant_id, email, full_name, role)
  values (
    new.id,
    new_tenant,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'owner'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- LIMITES POR PLAN (suscripción fija) — validación suave en inserciones
--  basico: 50 productos, 200 boletas/mes
--  pro:    500 productos, 5000 boletas/mes
--  empresa: ilimitado
-- (Se refinan al integrar pasarela de pago)
-- ---------------------------------------------------------------------------
create or replace function public.plan_limits(p_plan text)
returns table (max_products int, max_sales_per_month int)
language sql
immutable
as $$
  select
    case p_plan
      when 'basico'   then 50
      when 'pro'      then 500
      else 2147483647
    end,
    case p_plan
      when 'basico'   then 200
      when 'pro'      then 5000
      else 2147483647
    end;
$$;
