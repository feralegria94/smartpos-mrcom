import { useEffect, useRef, useState } from "react";
import {
  SMART_CHANGELOG,
  hasUnreadNews,
  markNewsRead,
} from "../lib/changelog";

const SUPPORT_EMAIL = "soporte@mrcomsoluciones.cl";

export default function Extras() {
  const [newsOpen, setNewsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [unread, setUnread] = useState(hasUnreadNews());
  const [report, setReport] = useState("");

  // ── Timer ──────────────────────────────────────────────
  const [mins, setMins] = useState(5);
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<number | null>(null);

  function tick() {
    setRemaining((r) => {
      if (r <= 1) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        try {
          new Notification("SmartPOS", { body: "⏰ Timer finalizado" });
        } catch {
          /* ignore */
        }
        alert("⏰ Timer finalizado");
        return 0;
      }
      return r - 1;
    });
  }

  function startTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setRemaining(mins * 60);
    timerRef.current = window.setInterval(tick, 1000);
    setTimerOpen(false);
  }
  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRemaining(0);
  }
  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  function openNews() {
    setNewsOpen(true);
    markNewsRead();
    setUnread(false);
  }

  function sendReport() {
    const body = encodeURIComponent(report || "(sin detalle)");
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      "SmartPOS — Reportar un problema"
    )}&body=${body}`;
    setReport("");
    setReportOpen(false);
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const btn =
    "flex h-9 w-9 items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition relative";

  return (
    <>
      <div className="flex items-center gap-1">
        <button className={btn} onClick={() => setTimerOpen(true)} title="Temporizador">
          <span className="material-symbols-rounded">alarm</span>
          {remaining > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-moon-600 px-1 text-[10px] font-bold text-white">
              {fmt(remaining)}
            </span>
          )}
        </button>

        <button className={btn} onClick={openNews} title="Novedades">
          <span className="material-symbols-rounded">notifications</span>
          {unread && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-400" />
          )}
        </button>

        <button className={btn} onClick={() => setReportOpen(true)} title="Reportar problema">
          <span className="material-symbols-rounded">flag</span>
        </button>
      </div>

      {/* Novedades */}
      {newsOpen && (
        <Modal onClose={() => setNewsOpen(false)} title="Novedades">
          <div className="space-y-4">
            {SMART_CHANGELOG.map((e) => (
              <div key={e.version}>
                <p className="text-sm font-semibold text-white">
                  v{e.version} · <span className="text-white/40">{e.date}</span> — {e.title}
                </p>
                <ul className="mt-1 list-disc pl-5 text-sm text-white/70">
                  {e.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Temporizador */}
      {timerOpen && (
        <Modal onClose={() => setTimerOpen(false)} title="Temporizador">
          <div className="space-y-3">
            <label className="label">Minutos</label>
            <input
              type="number"
              min={1}
              max={180}
              className="input"
              value={mins}
              onChange={(e) => setMins(Math.max(1, parseInt(e.target.value || "1", 10)))}
            />
            <div className="flex gap-2">
              <button className="btn-primary" onClick={startTimer}>
                Iniciar
              </button>
              {remaining > 0 && (
                <button className="btn-ghost" onClick={stopTimer}>
                  Detener ({fmt(remaining)})
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Reportar problema */}
      {reportOpen && (
        <Modal onClose={() => setReportOpen(false)} title="Reportar un problema">
          <div className="space-y-3">
            <p className="text-sm text-white/60">
              Cuéntanos qué falló. Se abrirá tu correo para enviarlo a soporte.
            </p>
            <textarea
              className="input"
              rows={4}
              placeholder="Describe el problema…"
              value={report}
              onChange={(e) => setReport(e.target.value)}
            />
            <button className="btn-primary w-full" onClick={sendReport}>
              Enviar reporte
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button className="text-white/50 hover:text-white" onClick={onClose}>
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
