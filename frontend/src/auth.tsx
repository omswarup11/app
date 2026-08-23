import { router } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";

type User = { id: string; name: string; phone?: string | null; email?: string | null; role: string };

type AuthState = {
  user: User | null;
  role: string | null;
  patientId: string | null;
  clinicId: string | null;
  doctorId: string | null;
  loading: boolean;
};

type AuthCtx = AuthState & {
  loginWithOtp: (phone: string, code: string) => Promise<string>;
  loginWithGoogle: (email: string, name: string) => Promise<string>;
  loginWithSupabase: (accessToken: string) => Promise<string>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const homeFor = (role: string) =>
  role === "patient" ? "/(tabs)"
  : role === "receptionist" ? "/reception"
  : role === "doctor" ? "/doctor"
  : "/staff";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null, role: null, patientId: null, clinicId: null, doctorId: null, loading: true,
  });

  const refresh = useCallback(async () => {
    const token = await storage.secureGet<string>(TOKEN_KEY, "");
    if (!token) {
      setState((s) => ({ ...s, loading: false, user: null, role: null }));
      return;
    }
    try {
      const me: any = await api.me();
      setState({
        user: me.user, role: me.role, patientId: me.patient_id,
        clinicId: me.clinic_id, doctorId: me.doctor_id, loading: false,
      });
    } catch {
      await storage.secureRemove(TOKEN_KEY);
      setState((s) => ({ ...s, loading: false, user: null, role: null }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const finishLogin = async (res: any): Promise<string> => {
    await storage.secureSet(TOKEN_KEY, res.token);
    await refresh();
    return homeFor(res.role);
  };

  const loginWithOtp = async (phone: string, code: string) => finishLogin(await api.verifyOtp(phone, code));
  const loginWithGoogle = async (email: string, name: string) => finishLogin(await api.google(email, name));
  const loginWithSupabase = async (accessToken: string) => finishLogin(await api.supabaseLogin(accessToken));

  const logout = async () => {
    try { await api.logout(); } catch {}
    await storage.secureRemove(TOKEN_KEY);
    setState({ user: null, role: null, patientId: null, clinicId: null, doctorId: null, loading: false });
    router.replace("/login");
  };

  return (
    <Ctx.Provider value={{ ...state, loginWithOtp, loginWithGoogle, loginWithSupabase, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
