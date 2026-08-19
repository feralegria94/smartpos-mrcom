import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile, Tenant } from "../types";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  tenant: Tenant | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(u: User | null) {
    if (!u) {
      setProfile(null);
      setTenant(null);
      return;
    }
    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", u.id)
      .single();
    setProfile(p);
    if (p) {
      const { data: t } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", p.tenant_id)
        .single();
      setTenant(t);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      loadProfile(data.session?.user ?? null).finally(() => setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function refresh() {
    const { data } = await supabase.auth.getUser();
    await loadProfile(data.user);
  }

  async function signOut() {
    // Fire and forget: informa al backend que la sesión se cierra.
    // Nunca bloquea el cierre aunque el RPC falle (offline-first).
    try {
      await supabase.rpc("session_unregister");
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setTenant(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile, tenant, loading, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
