# SmartPOS — SaaS de Punto de Venta

Punto de venta multi-tenant en la nube, desarrollado por MR.COM Soluciones.

**Demo:** https://chiloesmart-mrcom.netlify.app/

- **Stack:** Vite + React + TypeScript + Tailwind CSS
- **Backend:** Supabase (Auth + Postgres + Row Level Security multi-tenant)
- **Modelo:** Suscripción fija (planes `basico` / `pro` / `empresa`)

## Arquitectura multi-tenant

```
Usuario (auth Supabase)
  └─ profile.tenant_id  ──►  tenant (negocio)
        │
        ├─ products[]   (aislados por tenant_id vía RLS)
        ├─ customers[]
        └─ sales[]  (items en JSONB)
```

- **RLS** filtra todas las tablas por `current_tenant_id()`.
- **Trigger** `on_auth_user_created`: al registrarse, crea `tenant` + `profile`.
- **Límites por plan** en `plan_limits()` (productos / boletas por mes).

## Estructura

```
smartpos/
├── supabase/schema.sql     # schema multi-tenant + RLS + trigger
├── src/
│   ├── lib/supabase.ts     # cliente Supabase
│   ├── lib/format.ts       # normalizeCLP, formatCLP, CSV
│   ├── auth/               # AuthProvider, Login, Register, Onboarding
│   ├── components/layout/  # AppShell (sidebar + topbar)
│   └── pages/              # Dashboard, Products, Customers, Reports, Settings
└── .env.example
```

## Puesta en marcha (dev)

```bash
cp .env.example .env        # configurar Supabase
npm install
npm run dev                 # http://localhost:5173
```

## Funcionalidades

- **Caja POS:** carrito, boleta, historial de ventas
- **Productos / Clientes:** CRUD completo con multi-tenant
- **Reportes:** export CSV y boletas
- **Roles staff:** owner / admin / cajero con invitaciones
- **Sesión segura:** 1 sesión activa por cuenta, control de acceso por IP
- **Ruta de despacho:** dirección por cliente, vista de mapa con waypoints

## Roadmap

| Fase | Alcance |
|------|---------|
| F0 | Scaffold, design system, schema multi-tenant, auth |
| F1 | Caja POS funcional |
| F2 | Productos / Clientes CRUD |
| F3 | Reportes y export CSV/boletas |
| F4 | Pasarela de pago recurrente |
| F5 | Deploy producción |
| F6 | Roles staff, invitaciones, revocar acceso |
| F7 | Ruta de despacho con Maps |

---

Desarrollado por [MR.COM Soluciones](https://mrcomsoluciones.cl) — Castro, Chiloé, Chile.
