"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type AuthState = {
  token: string | null;
  setToken: (t: string | null) => void;
  logout: () => void;
};

const AuthCtx = createContext<AuthState | null>(null);
const STORAGE_KEY = "crm_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t) setTokenState(t);
  }, []);

  const setToken = (t: string | null) => {
    setTokenState(t);
    if (t) localStorage.setItem(STORAGE_KEY, t);
    else localStorage.removeItem(STORAGE_KEY);
  };

  const logout = () => setToken(null);

  const value = useMemo(() => ({ token, setToken, logout }), [token]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
