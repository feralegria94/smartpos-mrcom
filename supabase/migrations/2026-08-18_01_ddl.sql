-- ============================================================================
--  BLOQUE 01 — DDL (SEGURIDAD Y STAFF, 2026-08-18)
--  SmartPOS — ejecutar vía apply_migration.sh contra Management API
--  Idempotente: create table if not exists / create index if not exists
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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.active_sessions enable row level security;
alter table public.staff_invites  enable row level security;
