import { useEffect, useMemo, useState } from "react";
import { CartItem, cartTotal, formatCLP, normalizeCLP } from "../lib/format";
import { getSales, getCustomers, addCustomer, addSale, deleteSale, type LocalSale, type LocalCustomer } from "../lib/store";
import { useAuth } from "../auth/AuthProvider";
import { canAddSale, countSalesThisMonth, getPlanLimits, isUnlimited, PLAN_NAMES } from "../lib/limits";

// Generador de ID seguro también en contextos no seguros (HTTP/LAN, donde
// crypto.randomUUID no está disponible).
function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Dashboard() {
  const { tenant } = useAuth();

  // Borrador persistente del carrito (sobrevive a refrescar la página).
  const draftKey = tenant?.id ? `smartpos:draft:${tenant.id}` : null;
  const initialDraft = useMemo(() => {
    if (!draftKey) return null;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && typeof d === "object" ? (d as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [draftKey]);

  const [client, setClient] = useState(
    typeof initialDraft?.client === "string" ? (initialDraft.client as string) : ""
  );
  const [description, setDescription] = useState(
    typeof initialDraft?.description === "string" ? (initialDraft.description as string) : ""
  );
  const [price, setPrice] = useState(
    typeof initialDraft?.price === "string" ? (initialDraft.price as string) : ""
  );
  const [cart, setCart] = useState<CartItem[]>(
    Array.isArray(initialDraft?.cart) ? (initialDraft.cart as CartItem[]) : []
  );
  const [recent, setRecent] = useState<LocalSale[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);

  // Ghost-client: solo crear fila de cliente si el usuario lo marca.
  const [saveCustomer, setSaveCustomer] = useState(
    typeof initialDraft?.saveCustomer === "boolean" ? (initialDraft.saveCustomer as boolean) : false
  );
  // Reloj en vivo (portado de Moon POS)
  const [clock, setClock] = useState<Date>(new Date());
  // Temporizador de sesión de caja (desde apertura de pantalla)
  const [openAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date());
      setElapsed(Math.floor((Date.now() - openAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [openAt]);

  function loadRecent() {
    setRecent(getSales(tenant?.id ?? ""));
  }
  function removeSale(s: LocalSale) {
    if (!tenant) return;
    deleteSale(tenant.id, s.id);
    setRecent(getSales(tenant.id));
  }
  function loadCustomers() {
    setCustomers(getCustomers(tenant?.id ?? ""));
  }
  useEffect(() => {
    loadRecent();
    loadCustomers();
  }, []);

  // ── Persistencia del borrador (sobrevive a refrescar la página) ──
  useEffect(() => {
    if (!draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ cart, client, description, price, saveCustomer }));
    } catch {
      /* sin almacenamiento: ignorar */
    }
  }, [draftKey, cart, client, description, price, saveCustomer]);

  // Reloj en vivo
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  function addItem() {
    const p = normalizeCLP(price);
    if (!description.trim() || p <= 0) return;
    setCart((c) => [
      ...c,
      { id: uid(), client: client.trim(), description: description.trim(), price: p, qty: 1 },
    ]);
    setDescription("");
    setPrice("");
  }

  function removeItem(id: string) {
    setCart((c) => c.filter((i) => i.id !== id));
  }

  function updateItem(id: string, patch: Partial<CartItem>) {
    setCart((c) => c.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function setQty(id: string, qty: number) {
    if (qty < 1) return;
    setCart((c) => c.map((i) => (i.id === id ? { ...i, qty } : i)));
  }

  // Ghost-client fix (Moon POS): NO se crea fila de cliente en cada venta.
  // Solo se enlaza si ya existe, o se crea SI el usuario lo indica (saveCustomer).
  async function resolveCustomer(name: string, save: boolean): Promise<{ id: string | null; name: string | null }> {
    const n = name.trim();
    if (!n) return { id: null, name: null };
    const existing = customers.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (existing) return { id: existing.id, name: existing.name };
    if (!save) return { id: null, name: n }; // etiqueta en la boleta, sin fila fantasma
    const c = addCustomer(tenant?.id ?? "", n);
    setCustomers((prev) => [...prev, c]);
    return { id: c.id, name: c.name };
  }

  async function checkout() {
    if (!cart.length || busy) return;
    const saleCheck = canAddSale(tenant?.id ?? "", tenant?.plan);
    if (!saleCheck.ok) {
      setMsg(
        `Límite del plan ${PLAN_NAMES[tenant?.plan ?? "basico"]}: máximo ${saleCheck.limit} boletas/mes. Mejora tu plan.`
      );
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const total = cartTotal(cart);
      const items = cart.map((i) => ({ description: i.description, price: i.price, qty: i.qty }));
      const cust = await resolveCustomer(client, saveCustomer);
      addSale(tenant?.id ?? "", { customer_id: cust.id, customer_name: cust.name, total, items });
      setCart([]);
      setClient("");
      setMsg("Boleta registrada ✓");
      loadRecent();
    } catch (e) {
      setMsg("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
          <div className="card p-5 md:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">Nueva venta</h2>
              <span className="text-sm tabular-nums text-white/60">{clock.toLocaleTimeString("es-CL")}</span>
              <span className="text-xs tabular-nums text-white/40" title="Tiempo de sesión de caja">⏱ {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</span>
            </div>
            <div className="mb-5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/60">
              Plan <span className="font-semibold text-white">{PLAN_NAMES[tenant?.plan ?? "basico"]}</span> —{" "}
              {countSalesThisMonth(tenant?.id ?? "")} /{" "}
              {isUnlimited(getPlanLimits(tenant?.plan).maxSalesPerMonth)
                ? "∞"
                : getPlanLimits(tenant?.plan).maxSalesPerMonth}{" "}
              boletas este mes
            </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">Cliente</label>
              <input
                className="input"
                list="customer-list"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Nombre del cliente"
              />
              <datalist id="customer-list">
                {customers.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={saveCustomer}
                  onChange={(e) => setSaveCustomer(e.target.checked)}
                />
                Guardar en mi lista de clientes
              </label>
            </div>
            <div>
              <label className="label">Producto</label>
              <div className="input-group flex gap-2">
                <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="Descripción" />
                <button
                  type="button"
                  className="btn-ghost shrink-0"
                  title="Buscar con Google Lens"
                  onClick={() => window.open("https://lens.google.com/", "_blank")}
                >
                  <span className="material-symbols-rounded">search</span>
                </button>
              </div>
            </div>
            <div>
              <label className="label">Precio (CLP)</label>
              <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="0" />
            </div>
            <div className="flex items-end">
              <button className="btn-primary w-full py-3" onClick={addItem}>
                <span className="material-symbols-rounded">add_shopping_cart</span> Agregar
              </button>
            </div>
          </div>
        </div>

        <div className="card p-5 md:p-6">
          <h3 className="mb-3 font-semibold text-white">Últimas boletas</h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                <div>
                  <p className="text-sm text-white">{s.customer_name}</p>
                  <p className="text-xs text-white/40">{new Date(s.created_at).toLocaleString("es-CL")}</p>
                </div>
                <span className="flex items-center gap-3">
                  <span className="text-sm text-accent">{formatCLP(s.total)}</span>
                  <button
                    className="text-white/40 hover:text-red-400"
                    onClick={() => removeSale(s)}
                    title="Borrar boleta"
                  >
                    <span className="material-symbols-rounded align-middle text-base">delete</span>
                  </button>
                </span>
              </li>
            ))}
            {!recent.length && (
              <li className="text-sm text-white/40 sm:col-span-2">Sin ventas aún.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="card p-5 md:p-6 lg:sticky lg:top-4 lg:self-start">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-white">Carrito</h3>
            <span className="text-xl font-bold text-accent">{formatCLP(cartTotal(cart))}</span>
          </div>
          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/40">Sin ítems todavía.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {cart.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 py-3">
                  <input
                    className="input flex-1 min-w-[140px]"
                    value={i.description}
                    onChange={(e) => updateItem(i.id, { description: e.target.value })}
                    placeholder="Producto"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      className="btn-ghost h-9 w-9 !px-0"
                      onClick={() => setQty(i.id, i.qty - 1)}
                      title="Restar"
                    >
                      <span className="material-symbols-rounded text-[18px]">remove</span>
                    </button>
                    <input
                      className="input w-12 text-center"
                      type="number"
                      min={1}
                      value={i.qty}
                      onChange={(e) => setQty(i.id, Math.max(1, parseInt(e.target.value || "1", 10)))}
                    />
                    <button
                      className="btn-ghost h-9 w-9 !px-0"
                      onClick={() => setQty(i.id, i.qty + 1)}
                      title="Sumar"
                    >
                      <span className="material-symbols-rounded text-[18px]">add</span>
                    </button>
                  </div>
                  <input
                    className="input w-28"
                    inputMode="decimal"
                    value={i.price}
                    onChange={(e) => updateItem(i.id, { price: normalizeCLP(e.target.value) })}
                    placeholder="0"
                  />
                  <span className="w-20 text-right text-sm text-accent">{formatCLP(i.price * i.qty)}</span>
                  <button className="text-red-400 hover:text-red-300" onClick={() => removeItem(i.id)} title="Quitar">
                    <span className="material-symbols-rounded text-[20px]">delete</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="btn-primary mt-4 w-full" disabled={!cart.length || busy} onClick={checkout}>
            {busy ? "Registrando…" : "Registrar boleta"}
          </button>
          {msg && <p className="mt-2 text-center text-sm text-accent">{msg}</p>}
        </div>
    </div>
  );
}
