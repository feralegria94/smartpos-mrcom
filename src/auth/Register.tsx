import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AuthLayout } from "./Login";

interface RpcResult {
  ok?: boolean;
  message?: string;
}

export default function Register() {
  const [params] = useSearchParams();
  const inviteToken = params.get("invite") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    setError("");

    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setBusy(false);
      return setError(signUpError.message);
    }

    // Si vino con un token de invitación, aceptarla tras crear la cuenta.
    if (inviteToken) {
      const { data, error: rpcError } = await supabase.rpc("staff_accept_invite", {
        p_token: inviteToken,
      });
      const res = (data ?? null) as RpcResult | null;
      if (rpcError || res?.ok === false) {
        setBusy(false);
        return setError(
          res?.message ?? rpcError?.message ?? "No se pudo aceptar la invitación. Intenta de nuevo."
        );
      }
    }

    setBusy(false);
    setDone(true);
  }

  if (done) {
    return (
      <AuthLayout title="¡Listo!" subtitle="Tu cuenta fue creada correctamente.">
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            {inviteToken
              ? "¡Listo! Ya eres parte del negocio."
              : "Revisa tu correo para confirmar la cuenta (si es necesario)."}
          </p>
          <button className="btn-primary w-full" onClick={() => navigate("/login")}>
            Ir a iniciar sesión
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle={inviteToken ? "Has sido invitado a un negocio. Completa tus datos." : "Regístrate para comenzar."}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Contraseña</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div>
          <label className="label">Confirmar contraseña</label>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Creando cuenta…" : "Crear cuenta"}
        </button>
        <p className="text-center text-xs text-white/50">
          ¿Ya tienes cuenta?{" "}
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => navigate("/login")}
          >
            Inicia sesión
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}