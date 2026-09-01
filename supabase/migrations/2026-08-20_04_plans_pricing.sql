-- ============================================================================
--  SMARTPOS — Planes y precios centralizados (2026-08-20)
--  Objetivo: permitir editar precios de suscripción desde el dashboard
--  (solo administrador de plataforma MR.COM). Los precios dejan de estar
--  hardcodeados en el frontend y pasan a vivir en public.plans.
--
--  Bloques:
--    a) public.plans              -> precios/nombres centrales
--    b) public.platform_admins    -> quién es superadmin (MR.COM)
--    c) RPCs:
--         get_plans()              lectura pública de planes
--         is_platform_admin()      ¿el usuario actual es superadmin?
--         bootstrap_platform_admin() primer owner se auto-eleva a superadmin
--         admin_update_plan()      edita nombre/precio (solo superadmin)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a) PLANS (precios de suscripción centrales)
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id         text primary key check (id in ('basico','pro','empresa')),
  name       text not null,
  price      numeric(12,0) not null default 0 check (price >= 0),
  updated_at timestamptz not null default now()
);

insert into public.plans (id, name, price) values
  ('basico',  'Básico',  14990),
  ('pro',     'Pro',     29990),
  ('empresa', 'Empresa', 49990)
on conflict (id) do update set
  name  = excluded.name,
  price = excluded.price;

-- ---------------------------------------------------------------------------
-- b) PLATFORM_ADMINS (superadmin MR.COM)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.plans           enable row level security;
alter table public.platform_admins enable row level security;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans
  for select using (true);

-- platform_admins: sin política de lectura directa (solo vía RPC security definer)

-- ---------------------------------------------------------------------------
-- c) RPCs
-- ---------------------------------------------------------------------------

-- ¿El usuario autenticado es administrador de plataforma?
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

-- Bootstrap: el PRIMER dueño (owner) que lo invoque se vuelve superadmin.
-- Pensado para que MR.COM active su acceso una sola vez desde el dashboard.
create or replace function public.bootstrap_platform_admin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_role  text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'No autenticado');
  end if;

  select count(*) into v_count from public.platform_admins;
  if v_count > 0 then
    return jsonb_build_object('ok', false, 'message', 'Ya existe un administrador de plataforma');
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'owner' then
    return jsonb_build_object('ok', false, 'message', 'Solo un dueño (owner) puede activarse como administrador');
  end if;

  insert into public.platform_admins (user_id) values (auth.uid());
  return jsonb_build_object('ok', true, 'message', 'Acceso administrador activado');
end;
$$;

-- Lectura pública de planes (id, nombre, precio).
create or replace function public.get_plans()
returns table (id text, name text, price numeric)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, p.price
  from public.plans p
  order by case p.id when 'basico' then 1 when 'pro' then 2 else 3 end;
$$;

-- Edición de plan (solo superadmin).
create or replace function public.admin_update_plan(
  p_plan  text,
  p_price numeric default null,
  p_name  text default null
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

  update public.plans
  set
    name       = coalesce(p_name, name),
    price      = coalesce(p_price, price),
    updated_at = now()
  where id = p_plan;

  return jsonb_build_object('ok', true, 'message', 'Plan actualizado');
end;
$$;

-- Grants explícitos (Supabase por defecto ya expone a public; lo dejamos explícito)
grant execute on function public.is_platform_admin()        to anon, authenticated;
grant execute on function public.bootstrap_platform_admin() to authenticated;
grant execute on function public.get_plans()                to anon, authenticated;
grant execute on function public.admin_update_plan(text, numeric, text) to authenticated;
