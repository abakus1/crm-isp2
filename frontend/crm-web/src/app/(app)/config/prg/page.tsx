"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type JobLog = {
  id: number;
  level: string;
  line: string;
  created_at: string;
};

type PrgJob = {
  id: string;
  job_type: "fetch" | "import" | "reconcile";
  status: "running" | "success" | "failed" | "skipped";
  stage?: string | null;
  message?: string | null;
  meta: Record<string, any>;
  error?: string | null;
  started_at: string;
  updated_at: string;
  finished_at?: string | null;
  logs?: JobLog[];
};

type StartJobResp = { job: PrgJob };

function fmt(n?: number) {
  if (n === undefined || n === null) return "—";
  return new Intl.NumberFormat("pl-PL").format(n);
}

function fmtBytes(n?: number) {
  if (n === undefined || n === null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function percent(done?: number, total?: number) {
  if (!done || !total || total <= 0) return null;
  const p = Math.floor((done / total) * 100);
  return Math.max(0, Math.min(100, p));
}

export default function PrgConfigPage() {
  const { token, logout } = useAuth();
  const perms = usePermissions();

  const canAccess = perms.isAdmin || perms.hasAny(["prg.import.run", "prg.reconcile.run"]);
  const canImport = perms.isAdmin || perms.has("prg.import.run");
  const canReconcile = perms.isAdmin || perms.has("prg.reconcile.run");

  const [state, setState] = useState<PrgState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [job, setJob] = useState<PrgJob | null>(null);
  const pollRef = useRef<number | null>(null);

  async function loadState() {
    if (!token) return;
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

  async function loadJob(jobId: string) {
    if (!token) return;

    const j = await apiFetch<PrgJob>(`/prg/jobs/${jobId}?logs_limit=30`, {
      method: "GET",
      token,
      onUnauthorized: () => logout(),
    });

    setJob(j);

    if (j.status !== "running") {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      await loadState();
    }
  }

  function startPolling(jobId: string, jobType?: PrgJob["job_type"]) {
    if (pollRef.current) window.clearInterval(pollRef.current);

    // fetch potrafi skończyć szybciej niż 1s; import może być długi -> wolniej
    const interval = jobType === "fetch" ? 250 : 1000;

    // 1) od razu
    loadJob(jobId).catch(() => {});

    // 2) potem co interval
    pollRef.current = window.setInterval(() => {
      loadJob(jobId).catch(() => {});
    }, interval);
  }

  async function runFetch() {
    if (!token) return;
    setErr(null);
    setInfo(null);
    setJob(null);

    try {
      const res = await apiFetch<StartJobResp>("/prg/fetch/run", {
        method: "POST",
        token,
        body: {},
        onUnauthorized: () => logout(),
      });

      setJob(res.job);
      setInfo("Start pobierania PRG…");

      // tu wcześniej było: startPolling(res.job.id, res.job.job_type) + await loadJob()
      // to robiło dubla requestów; teraz startPolling robi pierwszy load sam.
      startPolling(res.job.id, res.job.job_type);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    }
  }

  async function runImport() {
    if (!token) return;
    setErr(null);
    setInfo(null);
    setJob(null);

    try {
      const res = await apiFetch<StartJobResp>("/prg/import/run", {
        method: "POST",
        token,
        body: { mode: "delta" },
        onUnauthorized: () => logout(),
      });

      setJob(res.job);
      setInfo("Start importu delta PRG…");

      // ważne: przekaż job_type, bo interval ma być wolniejszy dla import
      startPolling(res.job.id, res.job.job_type);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    }
  }

  async function runReconcile() {
    if (!token) return;
    setErr(null);
    setInfo(null);

    try {
      await apiFetch("/prg/reconcile/run", {
        method: "POST",
        token,
        body: {},
        onUnauthorized: () => logout(),
      });

      setInfo("Reconcile uruchomiony.");
      await loadState();
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    }
  }

  useEffect(() => {
    if (!token) return;
    if (!canAccess) return;

    loadState();

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canAccess]);

  const stats = useMemo(() => {
    if (!job) return null;
    const m = job.meta || {};
    return {
      rows_seen: m.rows_seen as number | undefined,
      inserted: m.inserted as number | undefined,
      updated: m.updated as number | undefined,
      skipped: m.skipped as number | undefined,
      bytes_downloaded: m.bytes_downloaded as number | undefined,
      bytes_total: m.bytes_total as number | undefined,
      filename: m.filename as string | undefined,
      changed: m.changed as boolean | undefined,
      sha256: m.sha256 as string | undefined,
    };
  }, [job]);

  const fetchPct = useMemo(() => {
    if (!stats || job?.job_type !== "fetch") return null;
    return percent(stats.bytes_downloaded, stats.bytes_total);
  }, [stats, job]);

  if (perms.loaded && !canAccess) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">PRG</div>
        <div className="mt-2 text-sm text-muted-foreground">Brak uprawnień do modułu PRG.</div>
      </div>
    );
  }

  const busy = job?.status === "running";

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → PRG</div>
        <div className="text-xs text-muted-foreground">
          Fetch → Import (delta/full) → Reconcile. Live statusy dla fetch/import.
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-red-600">{err}</div>
      )}

      {info && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">{info}</div>
      )}

      {job && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              Job: {job.job_type} • {job.status}
            </div>
            <div className="text-xs text-muted-foreground">{job.stage || "—"}</div>
          </div>

          <div className="text-sm">{job.message || "—"}</div>

          {job.status === "failed" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {job.error || "Błąd (brak szczegółów)."}
            </div>
          )}

          {/* PROGRESS BAR dla FETCH */}
          {job.job_type === "fetch" && fetchPct !== null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div>Pobieranie</div>
                <div>{fetchPct}%</div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-foreground transition-all"
                  style={{ width: `${fetchPct}%` }}
                />
              </div>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Plik: {stats.filename || "—"}</div>

              {job.job_type === "fetch" ? (
                <>
                  <div>
                    Pobrano: {fmtBytes(stats.bytes_downloaded)}
                    {stats.bytes_total ? ` / ${fmtBytes(stats.bytes_total)}` : ""}
                  </div>
                  <div>
                    Zmienione:{" "}
                    {stats.changed === undefined ? "—" : stats.changed ? "tak" : "nie"}
                  </div>
                  <div>SHA: {stats.sha256 ? String(stats.sha256).slice(0, 16) + "…" : "—"}</div>
                </>
              ) : (
                <>
                  <div>Wiersze: {fmt(stats.rows_seen)}</div>
                  <div>Dodano: {fmt(stats.inserted)}</div>
                  <div>Zaktualizowano: {fmt(stats.updated)}</div>
                  <div>Pominięto: {fmt(stats.skipped)}</div>
                </>
              )}
            </div>
          )}

          {job.logs && job.logs.length > 0 && (
            <div className="rounded-md border border-border bg-background p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Log (ostatnie wpisy)</div>
              <div className="max-h-40 overflow-auto text-xs space-y-1">
                {job.logs.map((l) => (
                  <div key={l.id} className="font-mono">
                    [{l.level}] {l.line}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-semibold">Stan datasetu</div>
        <div className="text-sm">Ostatni import: {state?.last_import_at || "—"}</div>
        <div className="text-sm">Ostatnia delta: {state?.last_delta_at || "—"}</div>
        <div className="text-sm">Ostatni reconcile: {state?.last_reconcile_at || "—"}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
          onClick={runFetch}
          disabled={!canImport || busy}
        >
          Pobierz bazę PRG
        </button>

        <button
          className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
          onClick={runImport}
          disabled={!canImport || busy}
        >
          Uruchom deltę PRG
        </button>

        <button
          className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
          onClick={runReconcile}
          disabled={!canReconcile || busy}
        >
          Reconcile (dopasuj lokalne)
        </button>
      </div>

      <div className="text-xs text-muted-foreground">
        Tip: kliknij <span className="font-medium">Pobierz</span> → jeśli “Zmienione: tak”, kliknij{" "}
        <span className="font-medium">Uruchom deltę</span>. Wszystko live, bez “czy to działa?”.
      </div>
    </div>
  );
}
