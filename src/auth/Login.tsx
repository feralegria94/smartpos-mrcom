import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthProvider";

interface SessionRegisterResult {
  ok?: boolean;
  blocked?: boolean;
  forced?: boolean;
  message?: string;
}

// Obtiene la IP pública del cliente. Si falla (offline), usa "local".
// Nunca bloquea el flujo: el login debe continuar sin IP.
async function getPublicIp(): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const d = (await res.json()) as { ip?: string };
      if (typeof d.ip === "string" && d.ip) return d.ip;
    }
  } catch {
    /* offline: sin IP pública */
  }
  return "local";
}

async function registerSession(force: boolean): Promise<SessionRegisterResult> {
  try {
    const ip = await getPublicIp();
    const { data, error } = await supabase.rpc("session_register", {
      p_ip: ip,
      p_user_agent: navigator.userAgent,
      p_force: force,
    });
    if (error) throw error;
    return (data ?? { ok: true }) as SessionRegisterResult;
  } catch {
    // Si el RPC falla (aún no existe en Supabase) no bloqueamos el acceso.
    return { ok: true };
  }
}

export default function Login() {
  const { user, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // pending: guard de sesión en curso (evita redirigir antes de resolver).
  const [pending, setPending] = useState(false);
  // conflict: cuenta activa desde otra IP (modal "tomar el control").
  const [conflict, setConflict] = useState(false);
  const navigate = useNavigate();

  // Si ya hay sesión activa y no estamos gestionando un guard/conflicto,
  // vamos al dashboard. Esto cubre refrescar /login con sesión viva.
  useEffect(() => {
    if (user && !pending && !conflict) navigate("/", { replace: true });
  }, [user, pending, conflict, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || pending) return;
    setBusy(true);
    setPending(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      setPending(false);
      return setError(error.message);
    }
    // Sesión OK → guard de sesión única (anti-compartición de cuenta).
    const res = await registerSession(false);
    setBusy(false);
    setPending(false);
    if (res?.blocked) {
      setConflict(true);
      setError(res.message ?? "Esta cuenta ya está activa desde otra IP.");
    } else {
      navigate("/");
    }
  }

  // Reintenta registrando la sesión en esta IP con fuerza (toma el control).
  async function takeControl() {
    setBusy(true);
    setConflict(false);
    setPending(true);
    setError("");
    const res = await registerSession(true);
    setBusy(false);
    setPending(false);
    if (res?.blocked) {
      setConflict(true);
      setError(res.message ?? "La cuenta sigue activa desde otra IP.");
    } else {
      navigate("/");
    }
  }

  // El usuario se queda en la otra IP: cierra sesión y no navega.
  async function cancelTakeover() {
    setBusy(true);
    setConflict(false);
    setPending(false);
    await signOut();
    setBusy(false);
    setError("");
  }

  return (
    <>
      <AuthLayout title="Inicia sesión" subtitle="Accede a tu punto de venta en la nube">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </AuthLayout>

      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="mb-2 text-lg font-semibold text-white">Sesión activa en otro dispositivo</h3>
            <p className="mb-5 text-sm text-white/60">
              Esta cuenta ya está activa desde otra IP. Si tomas el control, la otra sesión se cerrará.
              ¿Deseas continuar?
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="btn-ghost" onClick={cancelTakeover} disabled={busy}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={takeControl} disabled={busy}>
                {busy ? "Procesando…" : "Tomar el control"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-gradient-to-br from-sky-900 via-cyan-800 to-teal-700 p-6">
      <img
        src="https://images.unsplash.com/photo-1507525423211-b72b2aacc7b0?auto=format&fit=crop&w=1740&q=80"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        poster="https://images.unsplash.com/photo-1507525423211-b72b2aacc7b0?auto=format&fit=crop&w=1740&q=80"
        onError={(e) => {
          (e.currentTarget as HTMLVideoElement).style.display = "none";
        }}
      >
        <source src="/login-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/45" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <img src="/logo_mrcom.png" alt="MR.COM Soluciones" className="h-12 w-12 rounded-xl bg-white/90 p-1" />
          <div>
            <p className="text-lg font-semibold text-white">SmartPOS</p>
            <p className="text-xs text-white/60">por MR.COM Soluciones</p>
          </div>
        </div>
        <div className="card p-6">
          <h1 className="mb-1 text-2xl font-semibold text-white">{title}</h1>
          {subtitle && <p className="mb-6 text-sm text-white/50">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}