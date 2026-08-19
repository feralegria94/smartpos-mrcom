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

-- PROFILES: lectura aislada por tenant (todo el staff del tenant lee perfiles).
-- Las escrituras (insert/update/delete) quedan restringidas a owner/admin del
-- tenant mediante las policies profiles_manage* de la sección
-- "SEGURIDAD Y STAFF (2026-08-18)" al final de este archivo.
drop policy if exists profiles_isolation on public.profiles;
create policy profiles_isolation on public.profiles
  for select
  using (tenant_id = public.current_tenant_id());

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
-- (NO se modifica: los staff se registran igual por registro normal y luego
--  aceptan una invitación con handle_staff_register / staff_accept_invite)
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

-- ============================================================================
--  SEGURIDAD Y STAFF (2026-08-18)
--  ============================
--  a) Bloqueo de 1 sesión activa por cuenta (anti-compartición)
--  b) Dashboard de usuarios: invitar por email, cambiar rol, revocar acceso
--  c) Seguridad RLS endurecida (cashier no modifica perfiles)
--
--  Las RPCs son security definer (corren como el dueño, superuser en
--  Supabase => bypass RLS) con search_path = public; los permisos se validan
--  explícitamente dentro de cada función.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ACTIVE_SESSIONS: 1 sesión activa por cuenta (anti-compartición)
-- user_id es PK => índice implícito en user_id
-- ---------------------------------------------------------------------------
create table if not exists public.active_sessions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  ip           text not null,
  user_agent   text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- STAFF_INVITES: invitaciones de staff por email (owner/admin invitan)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_invites (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  email      text not null,
  role       text not null check (role in ('owner','admin','cashier')),
  token      text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz
);

create index if not exists idx_staff_invites_tenant on public.staff_invites(tenant_id);
create index if not exists idx_staff_invites_email  on public.staff_invites(lower(email));

alter table public.active_sessions enable row level security;
alter table public.staff_invites  enable row level security;

-- ---------------------------------------------------------------------------
-- RPC: session_register(p_ip, p_user_agent, p_force)
-- Registra la sesión activa del usuario autenticado. Anti-compartición:
--  - misma IP  -> renueva last_seen_at, {"ok": true, "same_ip": true}
--  - otra IP   -> bloquea (no toca la fila), {"ok": false, "blocked": true, ...}
--  - p_force   -> takeover: la nueva IP reemplaza a la anterior
--  - sin fila  -> inserta, {"ok": true, "blocked": false}
-- ---------------------------------------------------------------------------
drop function if exists public.session_register(text, text, boolean);
create or replace function public.session_register(
  p_ip text,
  p_user_agent text default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_existing public.active_sessions%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_authenticated');
  end if;

  if p_ip is null or p_ip = '' then
    return jsonb_build_object('ok', false, 'error', 'ip_required');
  end if;

  select * into v_existing
  from public.active_sessions
  where user_id = v_user;

  if v_existing.user_id is not null then
    -- takeover forzado: quita la sesión anterior y usa la nueva IP
    if p_force then
      update public.active_sessions
         set ip           = p_ip,
             user_agent   = coalesce(p_user_agent, user_agent),
             last_seen_at = now()
       where user_id = v_user;
      return jsonb_build_object('ok', true, 'forced', true);
    end if;

    -- misma IP -> sesión legítima, renovar last_seen
    if v_existing.ip = p_ip then
      update public.active_sessions
         set last_seen_at = now()
       where user_id = v_user;
      return jsonb_build_object('ok', true, 'same_ip', true);
    end if;

    -- IP distinta y sin force -> bloqueado (anti-compartición)
    return jsonb_build_object(
      'ok', false,
      'blocked', true,
      'message', 'Cuenta activa desde otra IP'
    );
  end if;

  insert into public.active_sessions (user_id, ip, user_agent)
  values (v_user, p_ip, p_user_agent);

  return jsonb_build_object('ok', true, 'blocked', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: session_unregister() — borra la sesión activa del usuario (logout)
-- ---------------------------------------------------------------------------
drop function if exists public.session_unregister();
create or replace function public.session_unregister()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.active_sessions where user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: staff_list() — perfiles del tenant actual, ordenados por created_at
-- ---------------------------------------------------------------------------
drop function if exists public.staff_list();
create or replace function public.staff_list()
returns table (id uuid, email text, full_name text, role text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select p.id, p.email, p.full_name, p.role::text, p.created_at
  from public.profiles p
  where p.tenant_id = public.current_tenant_id()
  order by p.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- RPC: staff_invite(p_email, p_role) — genera invitación (solo owner/admin).
-- Devuelve el token para armar el link de registro.
-- ---------------------------------------------------------------------------
drop function if exists public.staff_invite(text, text);
create or replace function public.staff_invite(p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_tenant  uuid;
  v_role    text;
  v_token   text := gen_random_uuid()::text;
  v_expires timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_authenticated');
  end if;

  if p_role not in ('owner','admin','cashier') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;

  if p_email is null or p_email = '' then
    return jsonb_build_object('ok', false, 'error', 'email_required');
  end if;

  select tenant_id, role into v_tenant, v_role
  from public.profiles
  where id = v_user;

  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'no_tenant');
  end if;

  if v_role not in ('owner','admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden',
      'message', 'Solo el owner o un admin pueden invitar staff');
  end if;

  -- el email ya pertenece al negocio
  if exists (
    select 1 from public.profiles
    where tenant_id = v_tenant and lower(email) = lower(p_email)
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_in_tenant',
      'message', 'Ese usuario ya pertenece al negocio');
  end if;

  -- regenerar invitación pendiente previa (no usada) del mismo email
  delete from public.staff_invites
   where tenant_id = v_tenant
     and lower(email) = lower(p_email)
     and used_at is null;

  v_expires := now() + interval '7 days';

  insert into public.staff_invites (tenant_id, email, role, token, created_by, expires_at)
  values (v_tenant, lower(p_email), p_role, v_token, v_user, v_expires);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_expires
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- handle_staff_register(p_token): crea/actualiza el profile del staff dentro
-- del tenant de la invitación. Se invoca manualmente desde staff_accept_invite
-- (queda disponible también para uso manual). NO toca el trigger existente
-- on_auth_user_created (handle_new_user) — los staff se registran normal.
-- ---------------------------------------------------------------------------
drop function if exists public.handle_staff_register(text);
create or replace function public.handle_staff_register(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_invite     public.staff_invites%rowtype;
  v_own_tenant uuid;
  v_user_email text;
  v_user_name  text;
  v_has_data   boolean;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_authenticated');
  end if;

  select * into v_invite from public.staff_invites where token = p_token;

  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token',
      'message', 'Invitación no encontrada');
  end if;

  if v_invite.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'token_used',
      'message', 'Esta invitación ya fue utilizada');
  end if;

  if v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'token_expired',
      'message', 'Esta invitación expiró');
  end if;

  select email, raw_user_meta_data->>'full_name'
    into v_user_email, v_user_name
  from auth.users where id = v_user;

  if lower(v_user_email) is distinct from lower(v_invite.email) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch',
      'message', 'La invitación fue emitida para otro email');
  end if;

  select tenant_id into v_own_tenant
  from public.profiles where id = v_user;

  if v_own_tenant is null then
    -- staff sin perfil: crear dentro del tenant de la invitación
    insert into public.profiles (id, tenant_id, email, full_name, role)
    values (v_user, v_invite.tenant_id, lower(v_invite.email), coalesce(v_user_name, ''), v_invite.role);
  elsif v_own_tenant = v_invite.tenant_id then
    -- ya pertenece al negocio (invitación repetida): actualizar rol
    update public.profiles
       set role  = v_invite.role,
           email = lower(v_invite.email)
     where id = v_user;
  else
    -- perfil en OTRO tenant: si tiene datos reales o miembros -> error;
    -- si es un tenant efímero creado por el trigger de registro -> mover y limpiar
    select (
      exists (select 1 from public.products  where tenant_id = v_own_tenant)
      or exists (select 1 from public.customers where tenant_id = v_own_tenant)
      or exists (select 1 from public.sales     where tenant_id = v_own_tenant)
      or exists (select 1 from public.profiles  where tenant_id = v_own_tenant and id <> v_user)
    ) into v_has_data;

    if v_has_data then
      return jsonb_build_object('ok', false, 'error', 'already_has_profile',
        'message', 'Ya tienes un perfil activo en otro negocio; usa otra cuenta');
    end if;

    update public.profiles
       set tenant_id = v_invite.tenant_id,
           role      = v_invite.role,
           email     = lower(v_invite.email),
           full_name = coalesce(v_user_name, full_name)
     where id = v_user;

    -- limpiar el tenant efímero (sin datos y sin otros miembros)
    delete from public.tenants where id = v_own_tenant and owner_id = v_user;
  end if;

  update public.staff_invites set used_at = now() where id = v_invite.id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: staff_accept_invite(p_token) — usado tras registrarse.
-- Delega en handle_staff_register (invocación manual desde este RPC).
-- ---------------------------------------------------------------------------
drop function if exists public.staff_accept_invite(text);
create or replace function public.staff_accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.handle_staff_register(p_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: staff_update_role(p_user_id, p_role) — solo owner. Protege el rol owner
-- (no dejar al tenant sin owner).
-- ---------------------------------------------------------------------------
drop function if exists public.staff_update_role(uuid, text);
create or replace function public.staff_update_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_tenant      uuid;
  v_caller_role text;
  v_target_role text;
  v_owner_count int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_authenticated');
  end if;

  if p_role not in ('owner','admin','cashier') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;

  select tenant_id, role into v_tenant, v_caller_role
  from public.profiles where id = v_user;

  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'no_tenant');
  end if;

  if v_caller_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'forbidden',
      'message', 'Solo el owner puede cambiar roles');
  end if;

  select role into v_target_role
  from public.profiles
  where id = p_user_id and tenant_id = v_tenant;

  if v_target_role is null then
    return jsonb_build_object('ok', false, 'error', 'user_not_found',
      'message', 'El usuario no pertenece a este negocio');
  end if;

  -- protección: no dejar al negocio sin owner (degradar/remover el último)
  if v_target_role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count
    from public.profiles
    where tenant_id = v_tenant and role = 'owner';
    if v_owner_count <= 1 then
      return jsonb_build_object('ok', false, 'error', 'last_owner',
        'message', 'El negocio debe conservar al menos un owner');
    end if;
  end if;

  update public.profiles
     set role = p_role
   where id = p_user_id and tenant_id = v_tenant;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: staff_remove(p_user_id) — solo owner. No puede removerse a sí mismo ni
-- remover al único owner. Borra profile + sesión activa del usuario.
-- ---------------------------------------------------------------------------
drop function if exists public.staff_remove(uuid);
create or replace function public.staff_remove(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_tenant      uuid;
  v_caller_role text;
  v_target_role text;
  v_owner_count int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_authenticated');
  end if;

  select tenant_id, role into v_tenant, v_caller_role
  from public.profiles where id = v_user;

  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'no_tenant');
  end if;

  if v_caller_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'forbidden',
      'message', 'Solo el owner puede revocar accesos');
  end if;

  if p_user_id = v_user then
    return jsonb_build_object('ok', false, 'error', 'self_remove',
      'message', 'No puedes removerte a ti mismo');
  end if;

  select role into v_target_role
  from public.profiles
  where id = p_user_id and tenant_id = v_tenant;

  if v_target_role is null then
    return jsonb_build_object('ok', false, 'error', 'user_not_found',
      'message', 'El usuario no pertenece a este negocio');
  end if;

  if v_target_role = 'owner' then
    select count(*) into v_owner_count
    from public.profiles
    where tenant_id = v_tenant and role = 'owner';
    if v_owner_count <= 1 then
      return jsonb_build_object('ok', false, 'error', 'last_owner',
        'message', 'El negocio debe conservar al menos un owner');
    end if;
  end if;

  delete from public.profiles where id = p_user_id and tenant_id = v_tenant;
  delete from public.active_sessions where user_id = p_user_id;

  return jsonb_build_object('ok', true,
    'message', 'El usuario perderá acceso a la cuenta');
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: my_session_info() — IP y last_seen de la sesión activa del usuario
-- (para mostrar en Settings: "Sesión activa desde IP X").
-- ---------------------------------------------------------------------------
drop function if exists public.my_session_info();
create or replace function public.my_session_info()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.active_sessions%rowtype;
begin
  if v_user is null then
    return null;
  end if;

  select * into v_row from public.active_sessions where user_id = v_user;

  if v_row.user_id is null then
    return jsonb_build_object('ip', null, 'last_seen_at', null);
  end if;

  return jsonb_build_object('ip', v_row.ip, 'last_seen_at', v_row.last_seen_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- POLICIES RLS — SEGURIDAD Y STAFF
--
-- PROFILES: la policy existente profiles_isolation era `for all`, lo que
-- dejaba que un cashier pudiera BORRAR perfiles (las USING de policies
-- permissive se combinan con OR). Se reemplaza arriba por `for select` y
-- las escrituras quedan así:
--   INSERT/UPDATE -> solo owner/admin del tenant (profiles_manage)
--   DELETE        -> solo owner/admin del tenant (profiles_manage_delete)
-- ---------------------------------------------------------------------------
drop policy if exists profiles_manage on public.profiles;
create policy profiles_manage on public.profiles
  for update
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = public.current_tenant_id()
        and p.role in ('owner','admin')
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = public.current_tenant_id()
        and p.role in ('owner','admin')
    )
  );

drop policy if exists profiles_manage_insert on public.profiles;
create policy profiles_manage_insert on public.profiles
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = public.current_tenant_id()
        and p.role in ('owner','admin')
    )
  );

drop policy if exists profiles_manage_delete on public.profiles;
create policy profiles_manage_delete on public.profiles
  for delete
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = public.current_tenant_id()
        and p.role in ('owner','admin')
    )
  );

-- ACTIVE_SESSIONS: el usuario solo ve/borra su propia fila
drop policy if exists active_sessions_own on public.active_sessions;
create policy active_sessions_own on public.active_sessions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- STAFF_INVITES: aislamiento por tenant (current_tenant_id()).
-- Los RPCs staff_invite / staff_accept_invite validan permisos por su cuenta.
drop policy if exists staff_invites_tenant on public.staff_invites;
create policy staff_invites_tenant on public.staff_invites
  for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
