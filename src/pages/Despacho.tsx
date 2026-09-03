import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  getDeliveryRows,
  type DeliveryRow,
} from "../lib/store";

/* ── Helpers de clipboard con fallback ──────────────────────── */

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback a execCommand */
  }
  // Fallback para contextos HTTP (no localhost)
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* ── Helpers de URL ─────────────────────────────────────────── */

function mapsSearchUrl(dir: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`;
}

function mapsRouteUrl(dirs: string[]): string {
  if (dirs.length < 2) return "";
  const origin = encodeURIComponent(dirs[0]);
  const destination = encodeURIComponent(dirs[dirs.length - 1]);
  const waypoints = dirs
    .slice(1, -1)
    .map((d) => encodeURIComponent(d))
    .join("|");
  const base = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  return waypoints ? `${base}&waypoints=${waypoints}` : base;
}

/* ── Componente ─────────────────────────────────────────────── */

export default function Despacho() {
  const { tenant } = useAuth();
  const tid = tenant?.id ?? "";

  const rows = useMemo(() => getDeliveryRows(tid), [tid]);

  const withAddress = useMemo(() => rows.filter((r) => r.customer.address?.trim()), [rows]);
  const withoutAddress = useMemo(() => rows.filter((r) => !r.customer.address?.trim()), [rows]);
  const globalTotal = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);

  const [copyOk, setCopyOk] = useState(false);
  const [routeCutoff, setRouteCutoff] = useState<number | null>(null);

  // Limpiar feedback de copia después de 3s
  useEffect(() => {
    if (!copyOk) return;
    const t = setTimeout(() => setCopyOk(false), 3000);
    return () => clearTimeout(t);
  }, [copyOk]);

  // Limpiar aviso de corte después de 5s
  useEffect(() => {
    if (routeCutoff === null) return;
    const t = setTimeout(() => setRouteCutoff(null), 5000);
    return () => clearTimeout(t);
  }, [routeCutoff]);

  /* ── Acciones ────────────────────────────────────────────── */

  function openMapsSingle(dir: string) {
    window.open(mapsSearchUrl(dir), "_blank", "noopener,noreferrer");
  }

  function openRoute() {
    const dirs = withAddress.map((r) => r.customer.address!.trim());
    if (dirs.length < 2) return;

    let routeDirs = dirs;
    if (dirs.length > 10) {
      routeDirs = dirs.slice(0, 10);
      setRouteCutoff(dirs.length - 10);
    }

    const url = mapsRouteUrl(routeDirs);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyAddresses() {
    const lines = withAddress.map(
      (r) => `${r.customer.name} → ${r.customer.address!.trim()}`
    );
    const text = lines.join("\n");
    const ok = await copyToClipboard(text);
    setCopyOk(ok);
  }

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
        <span className="material-symbols-rounded text-accent">local_shipping</span>
        Ruta de despacho
      </h1>

      {/* ── Resumen ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-accent">{withAddress.length}</p>
          <p className="text-xs text-white/50">Clientes con dirección</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-white">{rows.length}</p>
          <p className="text-xs text-white/50">Total clientes con ventas</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-accent">
            {new Intl.NumberFormat("es-CL", {
              style: "currency",
              currency: "CLP",
              maximumFractionDigits: 0,
            }).format(globalTotal)}
          </p>
          <p className="text-xs text-white/50">Total global</p>
        </div>
      </div>

      {/* ── Acciones ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-primary flex items-center gap-2"
          disabled={withAddress.length < 2}
          onClick={openRoute}
          title={withAddress.length < 2 ? "Necesitás al menos 2 direcciones" : "Crear ruta en Google Maps"}
        >
          <span className="material-symbols-rounded text-[18px]">route</span>
          Crear ruta
        </button>
        <button
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-40"
          disabled={withAddress.length === 0}
          onClick={copyAddresses}
        >
          <span className="material-symbols-rounded text-[18px]">content_copy</span>
          Copiar direcciones
        </button>
        {copyOk && (
          <span className="flex items-center gap-1 text-sm text-green-400">
            <span className="material-symbols-rounded text-[16px]">check_circle</span>
            Copiado
          </span>
        )}
        {routeCutoff !== null && (
          <span className="flex items-center gap-1 text-sm text-amber-400">
            <span className="material-symbols-rounded text-[16px]">warning</span>
            {routeCutoff} dirección{routeCutoff > 1 ? "es" : ""} quedó fuera (máx. 10 waypoints)
          </span>
        )}
      </div>

      {/* ── Lista de clientes ─────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="card p-8 text-center">
          <span className="material-symbols-rounded text-[48px] text-white/20">local_shipping</span>
          <p className="mt-2 text-sm text-white/40">
            No hay clientes con ventas registradas.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-white/5">
          {rows.map((row) => (
            <DeliveryRowItem key={row.customer.id} row={row} onMaps={openMapsSingle} />
          ))}
        </div>
      )}

      {/* ── Info ──────────────────────────────────────────── */}
      {withoutAddress.length > 0 && (
        <p className="text-xs text-white/40">
          {withoutAddress.length} cliente{withoutAddress.length > 1 ? "s" : ""} sin dirección
          registrada. Agregá su dirección en{" "}
          <span className="text-white/60">Clientes</span> para incluirlo en la ruta.
        </p>
      )}
    </div>
  );
}

/* ── Fila de cliente ────────────────────────────────────────── */

function DeliveryRowItem({
  row,
  onMaps,
}: {
  row: DeliveryRow;
  onMaps: (dir: string) => void;
}) {
  const { customer, total, saleCount } = row;
  const addr = customer.address?.trim();

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-white">{customer.name}</p>
        <p className="truncate text-xs text-white/40">
          {addr || "Sin dirección registrada"}
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm tabular-nums">
        <span className="text-white/50">
          {saleCount} venta{saleCount > 1 ? "s" : ""}
        </span>
        <span className="font-semibold text-accent">
          {new Intl.NumberFormat("es-CL", {
            style: "currency",
            currency: "CLP",
            maximumFractionDigits: 0,
          }).format(total)}
        </span>
      </div>

      {/* Acciones */}
      {addr && (
        <button
          className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
          onClick={() => onMaps(addr)}
          title="Abrir en Google Maps"
        >
          <span className="material-symbols-rounded text-[16px]">map</span>
          Maps
        </button>
      )}
    </div>
  );
}
