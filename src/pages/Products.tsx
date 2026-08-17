import { useEffect, useState } from "react";
import { formatCLP, normalizeCLP } from "../lib/format";
import { getProducts, addProduct, setProductActive, type LocalProduct } from "../lib/store";
import { useAuth } from "../auth/AuthProvider";

export default function Products() {
  const [items, setItems] = useState<LocalProduct[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const { tenant } = useAuth();

  function load() {
    setItems(getProducts(tenant?.id ?? ""));
  }
  useEffect(() => {
    load();
  }, []);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const p = normalizeCLP(price);
    if (!name.trim() || p <= 0) return;
    setBusy(true);
    addProduct(tenant?.id ?? "", name.trim(), p, category.trim() || null);
    setBusy(false);
    setName("");
    setPrice("");
    setCategory("");
    load();
  }

  function del(id: string) {
    setProductActive(tenant?.id ?? "", id, false);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Productos</h1>
      <form onSubmit={add} className="card mb-6 grid grid-cols-1 gap-3 p-5 md:grid-cols-4">
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Precio (CLP)</label>
          <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div>
          <label className="label">Categoría</label>
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={busy}>Agregar</button>
        </div>
      </form>

      <div className="card divide-y divide-white/5">
        {items.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-white">{p.name}</p>
              <p className="text-xs text-white/40">{p.category || "Sin categoría"}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-accent">{formatCLP(p.price)}</span>
              <button className="text-red-400 hover:text-red-300" onClick={() => del(p.id)}>
                <span className="material-symbols-rounded">delete</span>
              </button>
            </div>
          </div>
        ))}
        {!items.length && <p className="px-5 py-6 text-center text-sm text-white/40">Sin productos.</p>}
      </div>
    </div>
  );
}
