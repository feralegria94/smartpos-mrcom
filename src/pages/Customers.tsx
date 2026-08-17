import { useEffect, useState } from "react";
import { getCustomers, addCustomer, deleteCustomer, type LocalCustomer } from "../lib/store";
import { useAuth } from "../auth/AuthProvider";

export default function Customers() {
  const [items, setItems] = useState<LocalCustomer[]>([]);
  const [name, setName] = useState("");
  const { tenant } = useAuth();

  function load() {
    setItems(getCustomers(tenant?.id ?? ""));
  }
  useEffect(() => {
    load();
  }, []);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addCustomer(tenant?.id ?? "", name.trim());
    setName("");
    load();
  }

  function del(id: string) {
    deleteCustomer(tenant?.id ?? "", id);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Clientes</h1>
      <form onSubmit={add} className="card mb-6 grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full">Agregar</button>
        </div>
      </form>

      <div className="card divide-y divide-white/5">
          {items.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-white">{c.name}</p>
              </div>
            <button className="text-red-400 hover:text-red-300" onClick={() => del(c.id)}>
              <span className="material-symbols-rounded">delete</span>
            </button>
          </div>
        ))}
        {!items.length && <p className="px-5 py-6 text-center text-sm text-white/40">Sin clientes.</p>}
      </div>
    </div>
  );
}
