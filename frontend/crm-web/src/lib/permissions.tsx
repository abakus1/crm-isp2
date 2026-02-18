"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type MeActionsResponse = {
  role: string;
  action_codes: string[];
};

type PermissionsState = {
  loaded: boolean;
  role: string | null;
  actionCodes: Set<string>;
  isAdmin: boolean;
  has: (code: string) => boolean;
  hasAny: (codes: string[]) => boolean;
};

const PermissionsCtx = createContext<PermissionsState | null>(null);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [actionCodes, setActionCodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) {
        setLoaded(true);
        setRole(null);
        setActionCodes(new Set());
        return;
      }

      setLoaded(false);
      try {
        const data = await apiFetch<MeActionsResponse>("/rbac/me/actions", {
          method: "GET",
          token,
          onUnauthorized: () => logout(),
        });
        if (cancelled) return;
        setRole(data.role);
        setActionCodes(new Set(data.action_codes || []));
      } catch {
        if (cancelled) return;
        setRole(null);
        setActionCodes(new Set());
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  const value = useMemo<PermissionsState>(() => {
    const isAdmin = role === "admin";
    const has = (code: string) => (isAdmin ? true : actionCodes.has(code));
    const hasAny = (codes: string[]) => (isAdmin ? true : codes.some((c) => actionCodes.has(c)));
    return { loaded, role, actionCodes, isAdmin, has, hasAny };
  }, [loaded, role, actionCodes]);

  return <PermissionsCtx.Provider value={value}>{children}</PermissionsCtx.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionsCtx);
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider");
  return ctx;
}
