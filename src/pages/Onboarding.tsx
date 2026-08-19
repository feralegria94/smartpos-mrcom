import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { setConfig } from "../lib/store";
import type { Plan } from "../types";

const PLANS: { id: Plan; name: string; price: string; features: string[] }[] = [
  { id: "basico", name: "Básico", price: "$14.990/mes", features: ["50 productos", "200 boletas/mes", "2 usuarios"] },
  { id: "pro", name: "Pro", price: "$29.990/mes", features: ["500 productos", "5.000 boletas/mes", "3 usuarios", "Reportes avanzados"] },
  { id: "empresa", name: "Empresa", price: "$49.990/mes", features: ["Productos ilimitados", "Boletas ilimitadas", "Usuarios ilimitados", "Multi-sucursal", "Soporte prioritario"] },
];

export default function Onboarding() {
  const { tenant, refresh } = useAuth();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState("");
  const [rut, setRut] = useState("");
  const [address, setAddress] = useState("");
  const [plan, setPlan] = useState<Plan>("basico");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) {
      setError("Sesión no disponible. Vuelve a iniciar sesión.");
      return;
    }
    setBusy(true);
    setError("");
    // Modo offline (Moon style): la config del negocio vive en localStorage
    // por tenant, no en Supabase. Mismo patrón que Settings.tsx.
    setConfig(tenant.id, { name: businessName, rut, address, plan });
    setBusy(false);
    await refresh();
    navigate("/");
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-space-radial p-4">
      <div className="card w-full max-w-2xl p-6">
        <div className="mb-5 flex items-center gap-3">
          <img src="/logo_mrcom.png" alt="MR.COM Soluciones" className="h-11 w-11 rounded-xl bg-white/90 p-1" />
          <div>
            <p className="text-lg font-semibold text-white">SmartPOS</p>
            <p className="text-xs text-white/50">por MR.COM Soluciones</p>
          </div>
        </div>
        <h1 className="mb-1 text-2xl font-semibold text-white">Configura tu negocio</h1>
        <p className="mb-6 text-sm text-white/50">Unos datos y eliges tu plan. Puedes cambiarlo después.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Nombre del negocio</label>
            <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">RUT</label>
              <input className="input" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="76.123.456-7" />
            </div>
            <div>
              <label className="label">Dirección</label>
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Plan</label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {PLANS.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPlan(p.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    plan === p.id ? "border-moon-500 bg-moon-600/15" : "border-white/10 bg-white/5"
                  }`}
                >
                  <p className="font-semibold text-white">{p.name}</p>
                  <p className="text-sm text-accent">{p.price}</p>
                  <ul className="mt-2 space-y-1 text-xs text-white/50">
                    {p.features.map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Guardando…" : "Empezar a usar SmartPOS"}
          </button>
        </form>
      </div>
    </div>
  );
}
