-- ============================================================================
--  SMARTPOS — Panel de administración SaaS (2026-08-20)
--  Amplía el modelo de planes (límites editables) y agrega RPCs de gestión
--  para el superadmin MR.COM: métricas, listado de negocios y edición de
--  plan/estado de suscripción por negocio.
--
--  Idempotente. Aplicar con service_role (Dashboard SQL editor o API).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) PLANS: agregar límites editables (0 = ilimitado)
-- ---------------------------------------------------------------------------
alter table public.plans
  add column if not exists max_products          int not null default 0,
  add column if not exists max_sales_per_month   int not null default 0,
  add column if not exists max_staff             int not null default 0;

insert into public.plans (id, name, price, max_products, max_sales_per_month, max_staff) values
  ('basico',  'Básico',  14990, 50,  200,  2),
  ('pro',     'Pro',     29990, 500, 5000, 3),
  ('empresa', 'Empresa', 49990, 0,   0,    0)
on conflict (id) do update set
  name                 = excluded.name,
  price                = excluded.price,
  max_products         = excluded.max_products,
  max_sales_per_month  = excluded.max_sales_per_month,
  max_staff            = excluded.max_staff;

-- ---------------------------------------------------------------------------
-- 2) get_plans(): ahora devuelve también límites
-- ---------------------------------------------------------------------------
drop function if exists public.get_plans();
create or replace function public.get_plans()
returns table (
  id                  text,
  name                text,
  price               numeric,
  max_products        int,
  max_sales_per_month int,
  max_staff           int
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, p.price, p.max_products, p.max_sales_per_month, p.max_staff
  from public.plans p
  order by case p.id when 'basico' then 1 when 'pro' then 2 else 3 end;
$$;

-- ---------------------------------------------------------------------------
-- 3) admin_update_plan(): precio + nombre + límites
-- ---------------------------------------------------------------------------
drop function if exists public.admin_update_plan(text, numeric, text);
create or replace function public.admin_update_plan(
  p_plan                text,
  p_price               numeric default null,
  p_name                text default null,
  p_max_products        int default null,
  p_max_sales_per_month int default null,
  p_max_staff           int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'message', 'No autorizado: solo administrador de plataforma');
  end if;

  if p_plan not in ('basico','pro','empresa') then
    return jsonb_build_object('ok', false, 'message', 'Plan inválido');
  end if;

  if p_price is not null and p_price < 0 then
    return jsonb_build_object('ok', false, 'message', 'El precio no puede ser negativo');
  end if;
  if p_max_products is not null and p_max_products < 0 then
    return jsonb_build_object('ok', false, 'message', 'El límite de productos no puede ser negativo');
  end if;
  if p_max_sales_per_month is not null and p_max_sales_per_month < 0 then
    return jsonb_build_object('ok', false, 'message', 'El límite de boletas no puede ser negativo');
  end if;
  if p_max_staff is not null and p_max_staff < 0 then
    return jsonb_build_object('ok', false, 'message', 'El límite de usuarios no puede ser negativo');
  end if;

  update public.plans
  set
    name                = coalesce(p_name, name),
    price               = coalesce(p_price, price),
    max_products        = coalesce(p_max_products, max_products),
    max_sales_per_month = coalesce(p_max_sales_per_month, max_sales_per_month),
    max_staff           = coalesce(p_max_staff, max_staff),
    updated_at          = now()
  where id = p_plan;

  return jsonb_build_object('ok', true, 'message', 'Plan actualizado');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) plan_limits(): ahora lee de public.plans (fuente de verdad central)
-- ---------------------------------------------------------------------------
create or replace function public.plan_limits(p_plan text)
returns table (max_products int, max_sales_per_month int)
language sql
security definer
set search_path = public
stable
as $$
  select
    case when p.max_products = 0 then 2147483647 else p.max_products end,
    case when p.max_sales_per_month = 0 then 2147483647 else p.max_sales_per_month end
  from public.plans p
  where p.id = p_plan
  union all
  select 2147483647, 2147483647
  where not exists (select 1 from public.plans where id = p_plan)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 5) admin_stats(): métricas globales del SaaS
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_total     int;
  v_active    int;
  v_past_due  int;
  v_canceled  int;
  v_trialing  int;
  v_basico    int;
  v_pro       int;
  v_empresa   int;
  v_staff     int;
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'message', 'No autorizado');
  end if;

  select count(*) into v_total    from public.tenants;
  select count(*) into v_active   from public.tenants where subscription_status = 'active';
  select count(*) into v_past_due from public.tenants where subscription_status = 'past_due';
  select count(*) into v_canceled from public.tenants where subscription_status = 'canceled';
  select count(*) into v_trialing from public.tenants where subscription_status = 'trialing';
  select count(*) into v_basico   from public.tenants where plan = 'basico';
  select count(*) into v_pro      from public.tenants where plan = 'pro';
  select count(*) into v_empresa  from public.tenants where plan = 'empresa';
  select count(*) into v_staff    from public.profiles;

  return jsonb_build_object(
    'ok', true,
    'total_tenants',    v_total,
    'active_tenants',   v_active,
    'past_due_tenants', v_past_due,
    'canceled_tenants', v_canceled,
    'trialing_tenants', v_trialing,
    'tenants_by_plan',  jsonb_build_object('basico', v_basico, 'pro', v_pro, 'empresa', v_empresa),
    'total_staff',      v_staff
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) admin_list_tenants(): listado de negocios con métricas por tenant
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_tenants()
returns table (
  id                    uuid,
  name                  text,
  plan                  text,
  subscription_status   text,
  subscription_ends_at  timestamptz,
  created_at            timestamptz,
  staff_count           bigint,
  owner_email           text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    t.id,
    t.name,
    t.plan,
    t.subscription_status,
    t.subscription_ends_at,
    t.created_at,
    (select count(*) from public.profiles pr where pr.tenant_id = t.id) as staff_count,
    (select pr.email from public.profiles pr
      where pr.tenant_id = t.id and pr.role = 'owner'
      order by pr.created_at limit 1) as owner_email
  from public.tenants t
  order by t.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 7) admin_update_tenant(): cambia plan/estado de un negocio
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_tenant(
  p_tenant_id           uuid,
  p_plan                text default null,
  p_subscription_status text default null,
  p_subscription_ends_at timestamptz default null,
  p_clear_ends_at       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'message', 'No autorizado');
  end if;

  if p_plan is not null and p_plan not in ('basico','pro','empresa') then
    return jsonb_build_object('ok', false, 'message', 'Plan inválido');
  end if;
  if p_subscription_status is not null and p_subscription_status not in ('active','past_due','canceled','trialing') then
    return jsonb_build_object('ok', false, 'message', 'Estado de suscripción inválido');
  end if;

  update public.tenants
  set
    plan                  = coalesce(p_plan, plan),
    subscription_status   = coalesce(p_subscription_status, subscription_status),
    subscription_ends_at  = case
      when p_clear_ends_at then null
      when p_subscription_ends_at is not null then p_subscription_ends_at
      else subscription_ends_at
    end
  where id = p_tenant_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Negocio no encontrado');
  end if;

  return jsonb_build_object('ok', true, 'message', 'Negocio actualizado');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function public.get_plans()                         to anon, authenticated;
grant execute on function public.admin_update_plan(text, numeric, text, int, int, int) to authenticated;
grant execute on function public.admin_stats()                       to authenticated;
grant execute on function public.admin_list_tenants()                to authenticated;
grant execute on function public.admin_update_tenant(uuid, text, text, timestamptz, boolean) to authenticated;
