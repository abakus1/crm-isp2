"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type WhoAmI = {
  staff_id: number;
  username: string;
  role: string;
  bootstrap_mode: boolean;
  setup_mode: boolean;
};

type StaffUser = {
  id: number;
  role: string;
  status: string;
};

export function AdminLastAdminBanner() {
  const { token } = useAuth();

  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!token) {
        if (!cancelled) {
          setShow(false);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);

        const me = await apiFetch<WhoAmI>("/identity/whoami", {
          method: "GET",
          token,
        });

        // Banner tylko dla admina w normalnym trybie UI
        if (me.role !== "admin" || me.bootstrap_mode || me.setup_mode) {
          if (!cancelled) setShow(false);
          return;
        }

        const staff = await apiFetch<StaffUser[]>("/staff", {
          method: "GET",
          token,
        });

        const activeAdmins = staff.filter((u) => u.role === "admin" && u.status === "active").length;
        if (!cancelled) setShow(activeAdmins <= 1);
      } catch {
        // jeśli brak uprawnień /staff albo API nie działa — nie spamujemy UI
        if (!cancelled) setShow(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    check();
    const id = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  const body = useMemo(() => {
    if (loading) return null;
    if (!show) return null;
    return (
      <div className="mx-6 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs">
        <span className="font-semibold">Uwaga:</span> masz tylko jednego aktywnego admina —
        system <span className="font-semibold">nie pozwoli</span> go zablokować ani przenieść do archiwum.
      </div>
    );
  }, [loading, show]);

  return body;
}
