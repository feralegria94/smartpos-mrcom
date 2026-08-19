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

Para migraciones incrementales (puerto 5432 bloqueado por firewall):
```bash
/home/mrcom/smartpos/supabase/apply_migration.sh   # lee PAT de ~/.config/mrcom/supabase-pat.key
```

## Seguridad y staff (2026-08-18)

- **1 sesión activa por cuenta** (`active_sessions`): el login registra la IP pública del cliente (`session_register`). Si la cuenta ya está activa desde otra IP → bloqueo con opción "Tomar el control" (`p_force=true`). Logout limpia la sesión (`session_unregister`).
- **Dashboard Usuarios** (`/usuarios`, solo owner/admin): lista staff del tenant, invita por email (`staff_invite` → link `/register?invite=TOKEN`, expira en 7 días), cambia rol (`staff_update_role`, solo owner), revoca acceso (`staff_remove`, solo owner, protege último owner).
- **Roles**: `owner` (todo) / `admin` (invita, sin cambiar roles) / `cashier` (solo POS). RLS endurecida: `profiles_manage*` permite escribir perfiles solo a owner/admin.
- **Pago suscripciones (fase QR)**: cada plan muestra un QR que apunta a `https://link.mercadopago.cl/mrcomspa` (qrcode.react en Settings). La pasarela recurrente (Transbank/Stripe) queda para fase posterior.

## Roadmap MVP

| Fase | Alcance |
|------|---------|
| ✅ F0 | Scaffold, design system, schema multi-tenant, auth + onboarding |
| ⏳ F1 | Caja POS funcional (carrito, boleta, historial) — hecho base |
| ⏳ F2 | Productos / Clientes CRUD |
| ⏳ F3 | Reportes y export CSV/boletas |
| ✅ F6a | Roles staff (owner/admin/cajero), invitaciones, revocar acceso |
| ⏳ F4 | Pasarela de pago recurrente (Transbank/Stripe) — QR Mercado Pago ya activo |
| ⏳ F5 | Deploy Netlify + subdominio `smartpos.mrcomsoluciones.cl` (Cloudflare) |

## Git: commit + push (workflow rápido)

```bash
git add -A && git commit -m "..." && git push origin main
```

- Dev server: `nohup npm run dev > /tmp/smartpos-dev.log 2>&1 &` (desde `~/smartpos`, puerto 5173).
- Credenciales: `git credential.helper=store` → `~/.git-credentials` tiene `feralegria94:TOKEN@github.com` (token válido, verificado 200 vía API).
- ⚠️ Si `push` falla con `could not read Password`, es porque el remote tiene un token/username embebido en la URL y rompe el match del credential store. **Fix (una línea):**
  ```bash
  git remote set-url origin https://github.com/feralegria94/smartpos-mrcom.git
  ```

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
