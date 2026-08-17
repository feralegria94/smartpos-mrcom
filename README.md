# SmartPOS — SaaS de Punto de Venta

Primer SaaS de MR.COM Soluciones. Punto de venta multi-tenant en la nube, evolución de **Moon POS** con diseño profesional desde cero.

- **Dominio:** `smartpos.mrcomsoluciones.cl`
- **Modelo:** Suscripción fija (planes `basico` / `pro` / `empresa`)
- **Frontend:** Vite + React + TypeScript + Tailwind CSS
- **Backend:** Supabase reusado (`qtjcgbcqdhaubmdhqgxe`) — Auth + Postgres + RLS multi-tenant
- **Lógica de negocio:** portada desde Moon POS (`normalizeCLP`, carrito, boletas, CSV, estadísticas)

## Arquitectura multi-tenant

```
Usuario (auth Supabase)
  └─ profile.tenant_id  ──►  tenant (negocio)
        │
        ├─ products[]   (aislados por tenant_id vía RLS)
        ├─ customers[]
        └─ sales[]  (items en JSONB)
```

- **RLS** filtra todas las tablas por `current_tenant_id()` (deriva del `profile` del usuario).
- **Trigger** `on_auth_user_created`: al registrarse, crea `tenant` + `profile` (role `owner`).
- **Límites por plan** en `plan_limits()` (productos / boletas por mes).

## Estructura

```
smartpos/
├── supabase/schema.sql     # schema multi-tenant + RLS + trigger
├── src/
│   ├── lib/supabase.ts     # cliente Supabase
│   ├── lib/format.ts       # normalizeCLP, formatCLP, CSV (portado de Moon POS)
│   ├── auth/               # AuthProvider, Login, Register, Onboarding
│   ├── components/layout/  # AppShell (sidebar + topbar)
│   └── pages/              # Dashboard (caja), Products, Customers, Reports, Settings
└── .env.example
```

## Puesta en marcha (dev)

```bash
cp .env.example .env        # ya apunta al proyecto Supabase compartido
npm install
npm run dev                 # http://localhost:5173
```

## Aplicar el schema (una vez)

Pegar `supabase/schema.sql` en el **SQL Editor** del dashboard de Supabase (proyecto `qtjcgbcqdhaubmdhqgxe`) y ejecutar. Crea tablas, RLS y el trigger de registro.

## Roadmap MVP

| Fase | Alcance |
|------|---------|
| ✅ F0 | Scaffold, design system, schema multi-tenant, auth + onboarding |
| ⏳ F1 | Caja POS funcional (carrito, boleta, historial) — hecho base |
| ⏳ F2 | Productos / Clientes CRUD |
| ⏳ F3 | Reportes y export CSV/boletas |
| ⏳ F4 | Pasarela de pago (Transbank/Stripe) para cobro de planes |
| ⏳ F5 | Deploy Netlify + subdominio `smartpos.mrcomsoluciones.cl` (Cloudflare) |
| ⏳ F6 | Roles staff (admin/cajero), multi-caja, multi-sucursal |

## Deploy (Netlify) — ⚠️ REGLA CRÍTICA

> **NUNCA ejecutar `netlify deploy` sin confirmar EXPLÍCITAMENTE el SITE_ID destino.**
> Incidente 2026-08-17: se sobreescribió la tienda (shop.mrcomsoluciones.cl) con el build de SmartPOS por reutilizar el `NETLIFY_SITE_ID` del `.env`, que corresponde a la **SHOP**. Se restauró vía `restoreSiteDeploy`. No repetir.

- **SmartPOS** → site `785bfb89-5faa-49b7-8a63-d08092df644e` → https://chiloesmart-mrcom.netlify.app
- **Tienda MR.COM** → site `6bc82270-56cd-4afd-90b6-2f8edb69671d` → https://shop.mrcomsoluciones.cl
- El `NETLIFY_SITE_ID` del `.env` en `/var/www/dev/shop_mrcom/...` es de la **SHOP**: NO reutilizarlo para SmartPOS.
- Siempre verificar con `netlify sites:list --auth "$NETLIFY_TOKEN"` antes de cualquier deploy.

```bash
npm run build
netlify deploy --prod --dir=dist --auth "$NETLIFY_TOKEN" --site 785bfb89-5faa-49b7-8a63-d08092df644e
```
```
