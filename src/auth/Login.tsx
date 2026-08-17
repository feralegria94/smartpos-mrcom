import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    navigate("/");
  }

  return (
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
