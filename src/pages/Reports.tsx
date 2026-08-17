import { useEffect, useRef, useState } from "react";
import { formatCLP, downloadCsv, normalizeCLP } from "../lib/format";
import { getSales, getConfig, addSale, deleteSale, type LocalSale } from "../lib/store";
import { loadReceiptConfig, renderBoletaHtml } from "../lib/receipt";
import { useAuth } from "../auth/AuthProvider";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL");
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else cur += ch;
  }
  result.push(cur);
  return result;
}

export default function Reports() {
  const { tenant } = useAuth();
  const [sales, setSales] = useState<LocalSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState<string>("SmartPOS");
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Historial agregado por cliente (estilo Moon: historial por cliente)
  const byClient: Record<string, { boletas: number; total: number }> = {};
  sales.forEach((s) => {
    const key = s.customer_name?.trim() || "Sin cliente";
    if (!byClient[key]) byClient[key] = { boletas: 0, total: 0 };
    byClient[key].boletas += 1;
    byClient[key].total += s.total;
  });
  const clientList = Object.entries(byClient).sort((a, b) => b[1].total - a[1].total);

  useEffect(() => {
    setSales(getSales(tenant?.id ?? ""));
    setBusiness(getConfig(tenant?.id ?? "").name ?? "SmartPOS");
    setLoading(false);
  }, []);

  function exportCsv() {
    const rows: string[][] = [
      ["Folio", "Fecha", "Cliente", "Productos", "Total"],
      ...sales.map((s) => [
        s.id.slice(0, 8),
        fmtDate(s.created_at),
        s.customer_name ?? "Sin cliente",
        s.items.map((i) => `${i.qty}x ${i.description}`).join(" | "),
        String(s.total),
      ]),
    ];
    downloadCsv(`smartpos-ventas-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  // Importa "lista de ventas" (Cliente,Producto,Precio) fila por fila, estilo Moon.
  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg("Importando…");
    const text = await file.text();
    const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = clean.split("\n").filter((l) => l.trim());
    let added = 0;
    let skipHeader = false;
    const rows: { customer_name: string; total: number; items: LocalSale["items"] }[] = [];
    for (const line of lines) {
      const cols = parseCsvLine(line);
      if (cols.length < 3) continue;
      let cliente = cols[0].trim();
      const desc = cols[1].trim();
      const precio = normalizeCLP(cols[2]);
      if (!skipHeader && /cliente|producto|descripcion|precio/i.test(cliente) && isNaN(precio)) {
        skipHeader = true;
        continue;
      }
      if (!desc || isNaN(precio) || precio <= 0) continue;
      rows.push({
        customer_name: cliente || "Sin cliente",
        total: precio,
        items: [{ description: desc, price: precio, qty: 1 }],
      });
    }
    if (rows.length) {
      rows.forEach((r) =>
        addSale(tenant?.id ?? "", {
          customer_id: null,
          customer_name: r.customer_name,
          total: r.total,
          items: r.items,
        })
      );
      added = rows.length;
      setSales(getSales(tenant?.id ?? ""));
    }
    setImportMsg(`Importadas ${added} ventas ✓`);
    if (fileRef.current) fileRef.current.value = "";
    setTimeout(() => setImportMsg(""), 4000);
  }

  function openBoleta(s: LocalSale) {
    const cfg = loadReceiptConfig(tenant?.id);
    if (cfg.businessName === "SmartPOS" && business && business !== "SmartPOS") {
      cfg.businessName = business;
    }
    const html = renderBoletaHtml(s, cfg);
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }
  function removeBoleta(s: LocalSale) {
    if (!tenant) return;
    deleteSale(tenant.id, s.id);
    setSales(getSales(tenant.id));
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const today = sales.filter((s) => new Date(s.created_at) >= startOfDay);
  const month = sales.filter((s) => new Date(s.created_at) >= startOfMonth);

  const totalToday = today.reduce((a, s) => a + s.total, 0);
  const totalMonth = month.reduce((a, s) => a + s.total, 0);

  const top: Record<string, number> = {};
  month.forEach((s) =>
    s.items.forEach((i) => {
      top[i.description] = (top[i.description] || 0) + i.qty;
    })
  );
  const topList = Object.entries(top)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Reportes</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={importCsv}
          />
          <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={loading}>
            <span className="material-symbols-rounded align-middle">upload_file</span> Importar CSV
          </button>
          <button className="btn-primary" onClick={exportCsv} disabled={!sales.length}>
            <span className="material-symbols-rounded align-middle">download</span> Exportar CSV
          </button>
          {importMsg && <span className="text-sm text-accent">{importMsg}</span>}
        </div>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Ventas hoy" value={formatCLP(totalToday)} />
        <Stat label="Boletas hoy" value={String(today.length)} />
        <Stat label="Total del mes" value={formatCLP(totalMonth)} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-white">Productos más vendidos (mes)</h3>
          {topList.length ? (
            <ul className="space-y-2">
              {topList.map(([name, qty]) => (
                <li key={name} className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-white">{name}</span>
                  <span className="text-accent">{qty} u.</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/40">Sin datos este mes.</p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-white">Últimas ventas</h3>
          {loading ? (
            <p className="text-sm text-white/40">Cargando…</p>
          ) : (
            <ul className="space-y-2">
              {sales.slice(0, 10).map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-white">{s.customer_name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-accent">{formatCLP(s.total)}</span>
                    <button
                      className="text-xs text-white/60 hover:text-accent"
                      onClick={() => openBoleta(s)}
                      title="Ver boleta"
                    >
                      <span className="material-symbols-rounded align-middle text-base">receipt_long</span>
                    </button>
                    <button
                      className="text-xs text-white/40 hover:text-red-400"
                      onClick={() => removeBoleta(s)}
                      title="Borrar boleta"
                    >
                      <span className="material-symbols-rounded align-middle text-base">delete</span>
                    </button>
                  </span>
                </li>
              ))}
              {!sales.length && <p className="text-sm text-white/40">Sin ventas.</p>}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-3 font-semibold text-white">Historial por cliente</h3>
        {clientList.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40">
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4 text-right">Boletas</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {clientList.map(([name, agg]) => (
                  <tr key={name} className="border-t border-white/5">
                    <td className="py-2 pr-4 text-white">{name}</td>
                    <td className="py-2 pr-4 text-right text-white/70">{agg.boletas}</td>
                    <td className="py-2 text-right text-accent">{formatCLP(agg.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-white/40">Sin datos.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
