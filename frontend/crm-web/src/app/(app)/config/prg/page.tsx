"use client";

import { useEffect, useState } from "react";

import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";

type PrgState = {
  dataset_version?: string | null;
  dataset_updated_at?: string | null;
  last_import_at?: string | null;
  last_delta_at?: string | null;
  last_reconcile_at?: string | null;
  source_url?: string | null;
  checksum?: string | null;
};

export default function PrgConfigPage() {
  const { token, logout } = useAuth();
  const perms = usePermissions();

  const canAccess =
    perms.isAdmin ||
    perms.hasAny([
      "prg.import.run",
      "prg.local_point.create",
      "prg.local_point.edit",
      "prg.local_point.delete",
      "prg.local_point.approve",
      "prg.reconcile.run",
    ]);

  const [state, setState] = useState<PrgState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!token) return;
    setErr(null);
    try {
      const s = await apiFetch<PrgState>("/prg/state", {
        method: "GET",
        token,
        onUnauthorized: () => logout(),
      });
      setState(s);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    }
  }

  async function runImport() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      const s = await apiFetch<PrgState>("/prg/import/run", {
        method: "POST",
        token,
        body: { mode: "delta" },
        onUnauthorized: () => logout(),
      });
      setState(s);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    } finally {
      setBusy(false);
    }
  }

  async function runReconcile() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/prg/reconcile/run", {
        method: "POST",
        token,
        body: {},
        onUnauthorized: () => logout(),
      });
      await load();
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (!canAccess) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canAccess]);

  if (perms.loaded && !canAccess) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">PRG</div>
        <div className="mt-2 text-sm text-muted-foreground">Brak uprawnień do modułu PRG.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → PRG</div>
        <div className="text-xs text-muted-foreground">
          Fundament pod: local pending points + delta import + reconcile.
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-red-600">{err}</div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-semibold">Stan datasetu</div>
        <div className="text-sm">Ostatni import: {state?.last_import_at || "—"}</div>
        <div className="text-sm">Ostatnia delta: {state?.last_delta_at || "—"}</div>
        <div className="text-sm">Ostatni reconcile: {state?.last_reconcile_at || "—"}</div>
      </div>

      <div className="flex gap-2">
        <button
          className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
          onClick={runImport}
          disabled={busy || (!perms.isAdmin && !perms.has("prg.import.run"))}
        >
          Uruchom deltę PRG
        </button>
        <button
          className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
          onClick={runReconcile}
          disabled={busy || (!perms.isAdmin && !perms.has("prg.reconcile.run"))}
        >
          Reconcile (dopasuj lokalne)
        </button>
      </div>
    </div>
  );
}
