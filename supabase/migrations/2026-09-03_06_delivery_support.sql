-- ============================================================================
--  SMARTPOS — Soporte RUTA DE DESPACHO (2026-09-03)
--  Objetivo: habilitar la vista de despacho (delivery route) añadiendo
--  dirección de entrega a clientes y estado de entrega a ventas.
--
--  Bloques:
--    a) customers: add column address
--    b) sales: add columns delivery_address, delivery_status
--    c) Índice para filtrar ventas pendientes de despacho
--    d) RPC helper: get_delivery_pending() — ventas con dirección sin entregar
--
--  COMPATIBILIDAD:
--    - Todas las columnas son nullable / con default → no rompe datos existentes.
--    - RLS existente (customers_isolation, sales_isolation) cubre las nuevas
--      columnas automáticamente (son parte de las mismas filas).
--    - Ningún DROP, solo ADD COLUMN IF NOT EXISTS.
--
--  Aplicar:  ./apply_migration.sh  (Management API, sin puerto 5432)
--  O manual: pegar en Supabase Dashboard > SQL Editor
-- ============================================================================
-- NO TOCAR: este archivo es DISEÑO, no se aplica sin autorización del dueño.

-- ---------------------------------------------------------------------------
-- a) CUSTOMERS: dirección de entrega
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists address text;

comment on column public.customers.address is
  'Dirección de entrega / despacho del cliente (para ruta de despacho)';

-- ---------------------------------------------------------------------------
-- b) SALES: snapshot de dirección de entrega + estado de despacho
-- ---------------------------------------------------------------------------
alter table public.sales
  add column if not exists delivery_address text;

alter table public.sales
  add column if not exists delivery_status text
    default 'none'
    check (delivery_status in ('none','pending','in_transit','delivered','failed'));

comment on column public.sales.delivery_address is
  'Snapshot de dirección de entrega al momento de la venta (copia de customers.address)';

comment on column public.sales.delivery_status is
  'none=pago normal | pending=pendiente de despacho | in_transit=en camino | delivered=entregado | failed=falló';

-- ---------------------------------------------------------------------------
-- c) ÍNDICE: ventas pendientes de despacho por tenant (Dashboard de ruta)
-- ---------------------------------------------------------------------------
create index if not exists idx_sales_delivery_status
  on public.sales(tenant_id, delivery_status)
  where delivery_status in ('pending', 'in_transit');

-- ---------------------------------------------------------------------------
-- d) RPC: get_delivery_pending() — ventas del tenant con despacho pendiente
--     Devuelve ventas con dirección, ordenadas por fecha (más recientes primero).
--     Incluye customer_name, delivery_address, total, items, created_at.
-- ---------------------------------------------------------------------------
create or replace function public.get_delivery_pending()
returns table (
  id               uuid,
  customer_name    text,
  delivery_address text,
  delivery_status  text,
  total            numeric,
  items            jsonb,
  created_at       timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id,
    s.customer_name,
    s.delivery_address,
    s.delivery_status,
    s.total,
    s.items,
    s.created_at
  from public.sales s
  where s.tenant_id = public.current_tenant_id()
    and s.delivery_status in ('pending', 'in_transit')
    and s.delivery_address is not null
    and s.delivery_address <> ''
  order by s.created_at desc;
$$;

grant execute on function public.get_delivery_pending() to authenticated;

-- ---------------------------------------------------------------------------
-- e) RPC: update_delivery_status(p_sale_id, p_status) — cambiar estado
--     Solo el staff del tenant puede actualizar el estado de despacho.
-- ---------------------------------------------------------------------------
create or replace function public.update_delivery_status(
  p_sale_id uuid,
  p_status  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_sale   public.sales%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_authenticated');
  end if;

  if p_status not in ('pending', 'in_transit', 'delivered', 'failed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  select tenant_id into v_tenant
  from public.profiles where id = auth.uid();

  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'no_tenant');
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id and tenant_id = v_tenant;

  if v_sale.id is null then
    return jsonb_build_object('ok', false, 'error', 'sale_not_found');
  end if;

  update public.sales
     set delivery_status = p_status
   where id = p_sale_id and tenant_id = v_tenant;

  return jsonb_build_object('ok', true, 'new_status', p_status);
end;
$$;

grant execute on function public.update_delivery_status(uuid, text) to authenticated;

-- ============================================================================
--  FIN MIGRACIÓN — RUTA DE DESPACHO
-- ============================================================================
