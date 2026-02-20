"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type StaffUser = {
  id: number;
  username: string;
  email?: string | null;
  role: string;
  status: string;

  // nowe pola (opcjonalne)
  first_name?: string | null;
  last_name?: string | null;
  phone_company?: string | null;
};

type WhoAmI = {
  staff_id: number;
  username: string;
  role: string;
  bootstrap_mode: boolean;
  setup_mode: boolean;
};

function Badge({ status }: { status: string }) {
  const base =
    "inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] leading-4";
  const tone =
    status === "active"
      ? "bg-emerald-500/10"
      : status === "disabled"
      ? "bg-amber-500/10"
      : status === "archived"
      ? "bg-slate-500/10"
      : "bg-muted/40";
  return <span className={`${base} ${tone}`}>{status}</span>;
}

export default function StaffPage() {
  const { token, logout } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<WhoAmI | null>(null);

  const [rows, setRows] = useState<StaffUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleUnauthorized() {
    logout();
    router.replace("/login");
  }

  async function loadMe(): Promise<WhoAmI | null> {
    try {
      const data = await apiFetch<WhoAmI>("/identity/whoami", {
        method: "GET",
        token,
        onUnauthorized: handleUnauthorized,
      });
      setMe(data);
      return data;
    } catch {
      setMe(null);
      return null;
    }
  }

  async function load() {
    setError(null);
    setBusy(true);

    try {
      const who = me ?? (await loadMe());
      if (!who) {
        setRows([]);
        return;
      }

      if (who.role === "admin") {
        const data = await apiFetch<StaffUser[]>("/staff", {
          method: "GET",
          token,
          onUnauthorized: handleUnauthorized,
        });
        setRows(data);
      } else {
        const one = await apiFetch<StaffUser>("/staff/self", {
          method: "GET",
          token,
          onUnauthorized: handleUnauthorized,
        });
        setRows([one]);
      }
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd pobierania listy");
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (token) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const isAdminViewer = me?.role === "admin";

  const activeAdmins = useMemo(() => {
    return rows.filter((u) => u.role === "admin" && u.status === "active").length;
  }, [rows]);

  const visibleRows = useMemo(() => rows, [rows]);
  const hasRows = visibleRows.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Pracownicy</div>
        <div className="text-xs text-muted-foreground">
          {isAdminViewer ? "Widok admina: wszyscy" : "Widok pracownika: tylko własne konto"}
        </div>
      </div>

      {isAdminViewer && activeAdmins <= 1 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <span className="font-semibold">Uwaga:</span> masz tylko jednego aktywnego admina.
          Nie da się go zablokować ani przenieść do archiwum.
        </div>
      )}

      {error && <div className="rounded-md bg-destructive/10 p-3 text-xs">{error}</div>}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium">Lista pracowników</div>

          <div className="flex items-center gap-2">
            {isAdminViewer && (
              <Link
                href="/staff/new"
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
              >
                Dodaj pracownika
              </Link>
            )}

            <button
              onClick={() => load()}
              disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              {busy ? "Ładuję..." : "Odśwież"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left p-3">Nazwisko</th>
                <th className="text-left p-3">Imię</th>
                <th className="text-left p-3">Login</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Telefon firmowy</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Szczegóły</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-b-0">
                  <td className="p-3">{u.last_name || "-"}</td>
                  <td className="p-3">{u.first_name || "-"}</td>
                  <td className="p-3">{u.username}</td>
                  <td className="p-3 text-xs">{u.email || "-"}</td>
                  <td className="p-3 text-xs">{u.phone_company || "-"}</td>
                  <td className="p-3 text-xs">
                    <Badge status={u.status} />
                    {me?.staff_id === u.id && (
                      <span className="ml-2 text-[11px] text-muted-foreground">(to Ty)</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    <Link
                      href={`/staff/${u.id}`}
                      className="rounded-md border border-border px-2 py-1 hover:bg-muted/60"
                    >
                      Szczegóły
                    </Link>
                  </td>
                </tr>
              ))}

              {!busy && !hasRows && (
                <tr>
                  <td colSpan={7} className="p-6 text-xs text-muted-foreground">
                    Pusto. To nie powinno się zdarzyć — sprawdź /staff/self.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        401 → auto-logout, 403 → komunikat (RBAC).
      </div>
    </div>
  );
}