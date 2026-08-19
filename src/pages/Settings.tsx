import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../auth/AuthProvider";
import {
  getConfig,
  setConfig,
  getProducts,
  getCustomers,
  getSales,
  addProduct,
  addCustomer,
  addSale,
} from "../lib/store";
import { loadReceiptConfig, saveReceiptConfig, type ReceiptConfig } from "../lib/receipt";
import type { Plan } from "../types";

const PLAN_LABEL: Record<Plan, string> = {
  basico: "Básico — $9.990/mes",
  pro: "Pro — $24.990/mes",
  empresa: "Empresa — $59.990/mes",
};

export default function Settings() {
  const { tenant } = useAuth();
  const cfg = getConfig(tenant?.id ?? "");
  const [name, setName] = useState(cfg.name ?? tenant?.name ?? "");
  const [rut, setRut] = useState(cfg.rut ?? tenant?.rut ?? "");
  const [address, setAddress] = useState(cfg.address ?? tenant?.address ?? "");
  const [phone, setPhone] = useState(cfg.phone ?? tenant?.phone ?? "");
  const [email, setEmail] = useState(cfg.email ?? tenant?.email ?? "");
  const [plan, setPlan] = useState<Plan | undefined>(
    (cfg.plan as Plan | undefined) ?? tenant?.plan
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const restoreRef = useRef<HTMLInputElement>(null);

  const [designOpen, setDesignOpen] = useState(false);
  const [busyBkp, setBusyBkp] = useState(false);
  const [rcfg, setRcfg] = useState<ReceiptConfig>(() => loadReceiptConfig(tenant?.id));
  // Panel de pago con QR (acordeón, sin recargar la página).
  const [showQr, setShowQr] = useState(false);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) return;
    setBusy(true);
    setMsg("");
    setConfig(tenant.id, { name, rut, address, phone, email });
    setBusy(false);
    setMsg("Guardado ✓");
  }

  function changePlan(p: Plan) {
    if (!tenant) return;
    setConfig(tenant.id, { plan: p });
    setPlan(p);
  }

  function openDesign() {
    setRcfg(loadReceiptConfig(tenant?.id));
    setDesignOpen(true);
  }
  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setRcfg((c) => ({ ...c, logo: String(r.result) }));
    r.readAsDataURL(f);
  }
  function saveDesign() {
    saveReceiptConfig(rcfg, tenant?.id);
    setDesignOpen(false);
  }

  function exportBackup() {
    if (!tenant) return;
    setBusyBkp(true);
    try {
      const data = {
        exported_at: new Date().toISOString(),
        tenant: { id: tenant.id, name: tenant.name, rut: tenant.rut, address: tenant.address },
        products: getProducts(tenant.id),
        customers: getCustomers(tenant.id),
        sales: getSales(tenant.id),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smartpos-backup-${(tenant.name || "negocio").replace(/\s+/g, "-")}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("Backup descargado ✓");
    } catch (e) {
      setMsg("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyBkp(false);
    }
  }

  async function restoreBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;
    setBusyBkp(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as {
        products?: { name: string; price: number; category?: string | null }[];
        customers?: { name: string }[];
        sales?: { customer_id?: string | null; customer_name?: string | null; total: number; items: any[] }[];
      };
      (data.products ?? []).forEach((p) => addProduct(tenant.id, p.name, p.price, p.category ?? null));
      (data.customers ?? []).forEach((c) => addCustomer(tenant.id, c.name));
      (data.sales ?? []).forEach((s) =>
        addSale(tenant.id, {
          customer_id: s.customer_id ?? null,
          customer_name: s.customer_name ?? null,
          total: s.total,
          items: s.items,
        })
      );
      setMsg(
        `Restaurado: ${(data.products ?? []).length} productos, ${(data.customers ?? []).length} clientes, ${(
          data.sales ?? []
        ).length} boletas.`
      );
    } catch {
      setMsg("Error al restaurar: archivo de respaldo inválido.");
    } finally {
      setBusyBkp(false);
      if (e.target) e.target.value = "";
    }
  }

  if (!tenant) return null;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-white">Ajustes del negocio</h1>

      <form onSubmit={save} className="card mb-6 space-y-4 p-5">
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">RUT</label>
            <input className="input" value={rut} onChange={(e) => setRut(e.target.value)} />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Dirección</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={busy}>
          Guardar
        </button>
        {msg && <span className="ml-3 text-sm text-accent">{msg}</span>}
      </form>

      <div className="card p-5">
        <h3 className="mb-3 font-semibold text-white">Plan de suscripción</h3>
        <p className="mb-4 text-sm text-accent">{plan ? PLAN_LABEL[plan] : "—"}</p>
        <div className="flex flex-wrap gap-2">
          {(["basico", "pro", "empresa"] as Plan[]).map((p) => (
            <button
              key={p}
              className={p === plan ? "btn-primary" : "btn-ghost"}
              onClick={() => changePlan(p)}
            >
              {PLAN_LABEL[p].split(" — ")[0]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/40">
          El pago se realiza por Mercado Pago (manual). La pasarela automática (Transbank/Stripe) se
          integra en la siguiente fase para cobro automático.
        </p>

        <div className="mt-4 border-t border-white/10 pt-4">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setShowQr(!showQr)}
            aria-expanded={showQr}
          >
            <span className="material-symbols-rounded align-middle text-base">qr_code</span>
            {showQr ? "Ocultar pago" : "Pagar con Mercado Pago"}
          </button>

          {showQr && (
            <div className="mt-4">
              <h4 className="mb-1 font-semibold text-white">Suscríbete / Pagar</h4>
              <p className="mb-4 text-sm text-white/60">
                Escanea el QR con tu celular y paga con Mercado Pago. Tu plan se activa al confirmar
                el pago.
              </p>
              <div className="inline-block rounded-xl bg-white p-4 shadow-glow">
                <QRCodeSVG
                  value="https://link.mercadopago.cl/mrcomspa"
                  size={140}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                />
              </div>
              <p className="mt-3 text-xs text-white/40">
                El pago se acredita a tu suscripción actual{plan ? ` (${PLAN_LABEL[plan].split(" — ")[0]})` : ""}.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-white">Diseño de boleta</h3>
            <p className="text-sm text-white/40">Personaliza logo, colores y texto de agradecimiento.</p>
          </div>
          <button className="btn-primary" onClick={openDesign}>
            Diseño
          </button>
        </div>
      </div>

      {designOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDesignOpen(false)}
        >
          <div
            className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-white">Diseño de boleta</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Nombre del negocio</label>
                <input
                  className="input"
                  value={rcfg.businessName}
                  onChange={(e) => setRcfg({ ...rcfg, businessName: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Texto de agradecimiento</label>
                <input
                  className="input"
                  value={rcfg.thanksText}
                  onChange={(e) => setRcfg({ ...rcfg, thanksText: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Datos de cuenta / transferencia</label>
                <textarea
                  className="input"
                  rows={2}
                  value={rcfg.accountInfo}
                  onChange={(e) => setRcfg({ ...rcfg, accountInfo: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={rcfg.showLogo}
                    onChange={(e) => setRcfg({ ...rcfg, showLogo: e.target.checked })}
                  />{" "}
                  Mostrar logo
                </label>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={rcfg.showAccount}
                    onChange={(e) => setRcfg({ ...rcfg, showAccount: e.target.checked })}
                  />{" "}
                  Mostrar datos cuenta
                </label>
              </div>
              <div>
                <label className="label">Logo (PNG/JPG)</label>
                <input type="file" accept="image/*" onChange={onLogo} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Fondo</label>
                  <input
                    type="color"
                    className="input h-10 p-1"
                    value={rcfg.bgColor}
                    onChange={(e) => setRcfg({ ...rcfg, bgColor: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Texto</label>
                  <input
                    type="color"
                    className="input h-10 p-1"
                    value={rcfg.textColor}
                    onChange={(e) => setRcfg({ ...rcfg, textColor: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Borde</label>
                  <input
                    type="color"
                    className="input h-10 p-1"
                    value={rcfg.borderColor}
                    onChange={(e) => setRcfg({ ...rcfg, borderColor: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tamaño fuente</label>
                  <input
                    type="number"
                    className="input"
                    min={11}
                    max={18}
                    value={rcfg.fontSize}
                    onChange={(e) => setRcfg({ ...rcfg, fontSize: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Peso fuente</label>
                  <select
                    className="input"
                    value={rcfg.fontWeight}
                    onChange={(e) => setRcfg({ ...rcfg, fontWeight: e.target.value })}
                  >
                    <option value="300">Ligero</option>
                    <option value="400">Normal</option>
                    <option value="600">Semibold</option>
                    <option value="700">Bold</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDesignOpen(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={saveDesign}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-5">
        <h3 className="mb-3 font-semibold text-white">Respaldo / Guardar sesión</h3>
        <p className="mb-3 text-sm text-white/40">
          Descarga o restaura un respaldo JSON de productos, clientes y boletas de este negocio.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={exportBackup} disabled={busyBkp}>
            {busyBkp ? "Generando…" : "Descargar respaldo"}
          </button>
          <button
            className="btn-ghost"
            onClick={() => restoreRef.current?.click()}
            disabled={busyBkp}
          >
            Restaurar respaldo
          </button>
          <input
            ref={restoreRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={restoreBackup}
          />
        </div>
      </div>
    </div>
  );
}
