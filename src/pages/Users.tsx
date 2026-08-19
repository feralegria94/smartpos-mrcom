import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import type { Role } from "../types";

const ROLES: Role[] = ["owner", "admin", "cashier"];

const ROLE_LABEL: Record<Role, string> = {
  owner: "Dueño",
  admin: "Administrador",
  cashier: "Cajero",
};

interface StaffMember {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
}

interface RpcResult {
  ok?: boolean;
  message?: string;
  token?: string;
}

function roleBadge(role: Role): string {
  switch (role) {
    case "owner":
      return "bg-accent/15 text-accent border border-accent/30";
    case "admin":
      return "bg-sky-500/15 text-sky-300 border border-sky-500/30";
    default:
      return "bg-white/5 text-white/50 border border-white/10";
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-CL");
  } catch {
    return iso;
  }
}

// Copia texto al portapapeles con fallback para contextos no seguros (HTTP/LAN).
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* probar fallback */
  }
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

export default function Users() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // Formulario de invitación
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<Role>("cashier");
  const [inviteLink, setInviteLink] = useState("");

  const load = useCallback(async () => {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,created_at")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at");
    if (error) {
      setError(error.message);
    } else {
      setStaff((data ?? []) as StaffMember[]);
    }
    setLoading(false);
  }, [profile?.tenant_id]);

  useEffect(() => {
    load();
  }, [load]);

  // Solo owner y admin gestionan usuarios.
  if (profile?.role === "cashier") {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-white">Usuarios</h1>
        <div className="card p-10 text-center">
          <span className="material-symbols-rounded mb-3 text-4xl text-white/30">lock</span>
          <p className="text-white/60">Sin acceso. Solo el dueño o un administrador pueden gestionar usuarios.</p>
        </div>
      </div>
    );
  }

  const isOwner = profile?.role === "owner";
  const ownersCount = staff.filter((m) => m.role === "owner").length;

  async function changeRole(member: StaffMember, newRole: Role) {
    if (newRole === member.role) return;
    if (member.id === profile?.id) return; // no auto-degradarse
    if (!window.confirm(`¿Cambiar el rol de ${member.full_name ?? member.email} a "${ROLE_LABEL[newRole]}"?`)) return;
    setBusy(true);
    setMsg("");
    setError("");
    const { data, error } = await supabase.rpc("staff_update_role", {
      p_user_id: member.id,
      p_role: newRole,
    });
    const res = (data ?? null) as RpcResult | null;
    if (error || res?.ok === false) {
      setError(res?.message ?? error?.message ?? "No se pudo cambiar el rol.");
    } else {
      setMsg("Rol actualizado ✓");
      await load();
    }
    setBusy(false);
  }

  async function removeMember(member: StaffMember) {
    if (member.id === profile?.id) return; // no auto-revocarse
    if (
      !window.confirm(
        `¿Revocar el acceso de ${member.full_name ?? member.email}? Ya no podrá entrar a este negocio.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    setError("");
    const { data, error } = await supabase.rpc("staff_remove", { p_user_id: member.id });
    const res = (data ?? null) as RpcResult | null;
    if (error || res?.ok === false) {
      setError(res?.message ?? error?.message ?? "No se pudo revocar el acceso.");
    } else {
      setMsg("Acceso revocado ✓");
      await load();
    }
    setBusy(false);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!invEmail.trim()) return;
    setBusy(true);
    setMsg("");
    setError("");
    setInviteLink("");
    const { data, error } = await supabase.rpc("staff_invite", {
      p_email: invEmail.trim(),
      p_role: invRole,
    });
    const res = (data ?? null) as RpcResult | null;
    if (error || res?.ok === false) {
      setError(res?.message ?? error?.message ?? "No se pudo enviar la invitación.");
    } else {
      setMsg("Invitación enviada ✓");
      setInvEmail("");
      if (res?.token) {
        setInviteLink(`${window.location.origin}/register?invite=${res.token}`);
      }
      await load();
    }
    setBusy(false);
  }

  async function copyInvite() {
    if (!inviteLink) return;
    const ok = await copyText(inviteLink);
    setMsg(ok ? "Link copiado al portapapeles ✓" : "Copia el link manualmente");
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Usuarios</h1>

      <form onSubmit={invite} className="card mb-6 grid grid-cols-1 gap-3 p-5 md:grid-cols-[1fr_180px_auto]">
        <div>
          <label className="label">Invitar personal</label>
          <input
            className="input"
            type="email"
            value={invEmail}
            onChange={(e) => setInvEmail(e.target.value)}
            placeholder="correo@negocio.cl"
            required
          />
        </div>
        <div>
          <label className="label">Rol</label>
          <select className="input" value={invRole} onChange={(e) => setInvRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Enviando…" : "Invitar"}
          </button>
        </div>
      </form>

      {inviteLink && (
        <div className="card mb-6 border border-accent/30 p-5">
          <p className="mb-1 text-sm text-white/70">Link de registro para el invitado:</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="input flex-1 select-all text-xs">{inviteLink}</code>
            <button className="btn-ghost shrink-0" onClick={copyInvite}>
              <span className="material-symbols-rounded align-middle text-base">content_copy</span> Copiar link
            </button>
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {msg && <p className="mb-3 text-sm text-accent">{msg}</p>}

      <div className="card divide-y divide-white/5">
        {loading ? (
          <p className="px-5 py-6 text-center text-sm text-white/40">Cargando usuarios…</p>
        ) : staff.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-white/40">Sin usuarios todavía.</p>
        ) : (
          staff.map((m) => {
            const isSelf = m.id === profile?.id;
            // No degradar al único owner del negocio.
            const protectOwner = m.role === "owner" && ownersCount <= 1;
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {m.full_name ?? "Sin nombre"}
                    {isSelf && <span className="ml-2 text-xs text-white/40">(tú)</span>}
                  </p>
                  <p className="truncate text-xs text-white/40">{m.email}</p>
                  <p className="mt-1 text-xs text-white/30">Alta: {fmtDate(m.created_at)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${roleBadge(m.role)}`}>
                    {ROLE_LABEL[m.role]}
                  </span>
                  {isOwner && !isSelf && !protectOwner && (
                    <select
                      className="input w-auto py-1.5 text-xs"
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => changeRole(m, e.target.value as Role)}
                      title="Cambiar rol"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  )}
                  {isOwner && !isSelf && (
                    <button
                      className="rounded-xl border border-red-500/30 px-2.5 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                      onClick={() => removeMember(m)}
                      disabled={busy}
                      title="Revocar acceso"
                    >
                      Revocar
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {isOwner && (
        <p className="mt-4 text-xs text-white/40">
          Solo el dueño puede cambiar roles y revocar accesos. No puedes revocarte a ti mismo ni dejar al negocio sin dueño.
        </p>
      )}
    </div>
  );
}