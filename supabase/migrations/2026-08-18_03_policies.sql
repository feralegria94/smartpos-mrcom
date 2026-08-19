-- ============================================================================
--  BLOQUE 03 — Policies RLS (SEGURIDAD Y STAFF, 2026-08-18)
--  SmartPOS — idempotente: drop policy if exists + create policy
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PROFILES — endurecimiento
-- La policy existente profiles_isolation era `for all`, lo que dejaba que un
-- cashier pudiera BORRAR perfiles (las USING de policies permissive se
-- combinan con OR). Se reemplaza por:
--   - SELECT         : aislamiento por tenant (todo el staff lee perfiles)
--   - INSERT/UPDATE  : solo owner/admin del tenant (profiles_manage)
--   - DELETE         : solo owner/admin del tenant (profiles_manage_delete)
-- ---------------------------------------------------------------------------
drop policy if exists profiles_isolation on public.profiles;
create policy profiles_isolation on public.profiles
  for select
  using (tenant_id = public.current_tenant_id());

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

-- ---------------------------------------------------------------------------
-- ACTIVE_SESSIONS: el usuario solo ve/borra su propia fila
-- ---------------------------------------------------------------------------
drop policy if exists active_sessions_own on public.active_sessions;
create policy active_sessions_own on public.active_sessions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- STAFF_INVITES: aislamiento por tenant (current_tenant_id()).
-- Los RPCs staff_invite / staff_accept_invite validan permisos por su cuenta.
-- ---------------------------------------------------------------------------
drop policy if exists staff_invites_tenant on public.staff_invites;
create policy staff_invites_tenant on public.staff_invites
  for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
