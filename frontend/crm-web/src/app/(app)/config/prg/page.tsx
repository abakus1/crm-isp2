// frontend/crm-web/src/app/(app)/config/prg/page.tsx
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
  address_points_count?: number | null;
  adruni_building_numbers_count?: number | null;
};

type PlaceSuggest = {
  place_name: string;
  terc: string;
  simc: string;
  buildings_count: number;
};

type StreetSuggest = {
  street_name: string;
  ulic: string;
  buildings_count: number;
};

type BuildingRow = {
  building_no: string;
  terc: string;
  simc: string;
  ulic?: string | null;
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
  status: "running" | "success" | "failed" | "skipped" | "cancelled";
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

  // ADRUNI lookup UI
  const [placeQ, setPlaceQ] = useState<string>("");
  const [placeSug, setPlaceSug] = useState<PlaceSuggest[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placePicked, setPlacePicked] = useState<PlaceSuggest | null>(null);

  const [streetQ, setStreetQ] = useState<string>("");
  const [streetSug, setStreetSug] = useState<StreetSuggest[]>([]);
  const [streetLoading, setStreetLoading] = useState(false);
  const [streetPicked, setStreetPicked] = useState<StreetSuggest | null>(null);

  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(false);
  const [lookupErr, setLookupErr] = useState<string | null>(null);

  // KEEPALIVE (tylko na ekranie PRG i tylko gdy job running)
  const keepaliveRef = useRef<number | null>(null);
  const lastPingAtRef = useRef<number>(0);
  const KEEPALIVE_MS = 60_000;

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

  async function lookupPlaces(q: string) {
    if (!token) return;
    const qq = q.trim();
    if (qq.length < 2) {
      setPlaceSug([]);
      return;
    }

    setLookupErr(null);
    setPlaceLoading(true);
    try {
      const res = await apiFetch<PlaceSuggest[]>(
        `/prg/lookup/places?q=${encodeURIComponent(qq)}&limit=20`,
        {
          method: "GET",
          token,
          onUnauthorized: () => logout(),
        }
      );
      setPlaceSug(res || []);
    } catch (e: any) {
      const ae = e as ApiError;
      setLookupErr(ae?.message || "Błąd wyszukiwania miejscowości");
    } finally {
      setPlaceLoading(false);
    }
  }

  async function lookupStreets(terc: string, simc: string, q: string) {
    if (!token) return;
    const qq = q.trim();
    if (qq.length < 1) {
      setStreetSug([]);
      return;
    }

    setLookupErr(null);
    setStreetLoading(true);
    try {
      const res = await apiFetch<StreetSuggest[]>(
        `/prg/lookup/streets?terc=${encodeURIComponent(terc)}&simc=${encodeURIComponent(
          simc
        )}&q=${encodeURIComponent(qq)}&limit=50`,
        {
          method: "GET",
          token,
          onUnauthorized: () => logout(),
        }
      );
      setStreetSug(res || []);
    } catch (e: any) {
      const ae = e as ApiError;
      setLookupErr(ae?.message || "Błąd wyszukiwania ulic");
    } finally {
      setStreetLoading(false);
    }
  }

  async function lookupBuildings(terc: string, simc: string, ulic: string) {
    if (!token) return;
    setLookupErr(null);
    setBuildingsLoading(true);
    try {
      const res = await apiFetch<BuildingRow[]>(
        `/prg/lookup/buildings?terc=${encodeURIComponent(terc)}&simc=${encodeURIComponent(
          simc
        )}&ulic=${encodeURIComponent(ulic)}&limit=2000`,
        {
          method: "GET",
          token,
          onUnauthorized: () => logout(),
        }
      );
      setBuildings(res || []);
    } catch (e: any) {
      const ae = e as ApiError;
      setLookupErr(ae?.message || "Błąd pobierania budynków");
      setBuildings([]);
    } finally {
      setBuildingsLoading(false);
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

    // czyścimy "Start ..." jak już job jest w toku / skończony
    if (j.status === "running" || (j.status === "cancelled" && !j.finished_at)) {
      setInfo(null);
    }

    if (!(j.status === "running" || (j.status === "cancelled" && !j.finished_at))) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      // po zakończeniu odśwież stan datasetu
      await loadState();
      // i nie trzymaj w UI starego "Start ..."
      setInfo(null);
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

  async function loadActiveJob() {
    if (!token) return;
    try {
      const j = await apiFetch<PrgJob | null>("/prg/jobs/active?logs_limit=30", {
        method: "GET",
        token,
        onUnauthorized: () => logout(),
      });

      if (j && (j.status === "running" || (j.status === "cancelled" && !j.finished_at))) {
        setJob(j);
        setInfo(null);
        startPolling(j.id, j.job_type);
      }
    } catch {
      // ignorujemy – UI ma działać nawet jeśli endpoint chwilowo nie działa
    }
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
      setInfo("Trwa pobieranie PRG…");
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
      setInfo("Trwa import delta PRG…");
      startPolling(res.job.id, res.job.job_type);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    }
  }

  async function cancelActiveJob() {
    if (!token) return;
    setErr(null);

    try {
      await apiFetch("/prg/jobs/cancel", {
        method: "POST",
        token,
        body: {},
        onUnauthorized: () => logout(),
      });

      setInfo("Zlecono przerwanie joba…");
      // odświeżymy joba przez polling; jeśli go nie mamy, spróbuj złapać aktywny
      if (job?.id) startPolling(job.id, job.job_type);
      else loadActiveJob();
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
    loadActiveJob(); // ✅ po powrocie na stronę łapiemy running/cancelling job i wznawiamy polling

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;

      if (keepaliveRef.current) window.clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canAccess]);

  // Debounce: miejscowość
  useEffect(() => {
    if (!token || !canAccess) return;
    const t = window.setTimeout(() => {
      // jeśli ktoś już wybrał miejscowość, a potem edytuje tekst — kasujemy wybór
      if (placePicked && placePicked.place_name !== placeQ.trim()) {
        setPlacePicked(null);
        setStreetPicked(null);
        setStreetQ("");
        setStreetSug([]);
        setBuildings([]);
      }
      lookupPlaces(placeQ);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeQ, token, canAccess]);

  // Debounce: ulica
  useEffect(() => {
    if (!token || !canAccess) return;
    if (!placePicked) return;

    const t = window.setTimeout(() => {
      if (streetPicked && streetPicked.street_name !== streetQ.trim()) {
        setStreetPicked(null);
        setBuildings([]);
      }
      lookupStreets(placePicked.terc, placePicked.simc, streetQ);
    }, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetQ, placePicked, token, canAccess]);

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

  // ✅ MUSI być przed warunkowymi returnami (żeby nie łamać kolejności hooków)
  const busy = job ? (job.status === "running" || (job.status === "cancelled" && !job.finished_at)) : false;

  // KEEPALIVE: tylko gdy job running + jesteśmy na tej stronie
  useEffect(() => {
    const clear = () => {
      if (keepaliveRef.current) window.clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    };

    if (!token || !canAccess || !busy) {
      clear();
      return;
    }

    async function ping() {
      const now = Date.now();
      if (now - lastPingAtRef.current < KEEPALIVE_MS - 500) return;
      lastPingAtRef.current = now;

      try {
        await apiFetch("/identity/whoami", {
          method: "GET",
          token,
          onUnauthorized: () => logout(),
        });
      } catch {
        // ignorujemy – jeśli token padnie, polling joba i tak złapie 401 i logout()
      }
    }

    ping();

    keepaliveRef.current = window.setInterval(() => {
      ping();
    }, KEEPALIVE_MS);

    return clear;
  }, [token, canAccess, busy, logout]);

  // dopiero TERAZ wolno robić early return
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
        <div className="text-sm">Punkty adresowe: {state?.address_points_count ?? "—"}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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

        <div className="flex-1" />

        <button
          className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
          onClick={cancelActiveJob}
          disabled={!busy}
          title={!busy ? "Brak aktywnego joba" : "Przerwij aktywny job PRG"}
        >
          Przerwij
        </button>
      </div>

      {/* WYSZUKIWARKA LOKALIZACJI */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">Wyszukiwarka lokalizacji (PRG)</div>
        <div className="text-xs text-muted-foreground">
          Flow: miejscowość → ulica → lista budynków (z kodami TERC/SIMC/ULIC). Działa na ADRUNI.
        </div>

        {lookupErr && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{lookupErr}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Miejscowość</label>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="np. Kraków…"
              value={placeQ}
              onChange={(e) => setPlaceQ(e.target.value)}
            />

            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <div>
                {placePicked ? (
                  <span>
                    Wybrano: <span className="font-medium text-foreground">{placePicked.place_name}</span> • TERC{" "}
                    {placePicked.terc} • SIMC {placePicked.simc}
                  </span>
                ) : (
                  <span>Wpisz min. 2 znaki, żeby podpowiedziało miejscowości.</span>
                )}
              </div>
              <div>{placeLoading ? "szukam…" : null}</div>
            </div>

            {!placePicked && placeSug.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-md border border-border bg-background">
                {placeSug.map((p) => (
                  <button
                    key={`${p.terc}-${p.simc}-${p.place_name}`}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
                    onClick={() => {
                      setPlacePicked(p);
                      setPlaceQ(p.place_name);
                      setPlaceSug([]);
                      setStreetPicked(null);
                      setStreetQ("");
                      setStreetSug([]);
                      setBuildings([]);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{p.place_name}</div>
                      <div className="text-xs text-muted-foreground">{fmt(p.buildings_count)} bud.</div>
                    </div>
                    <div className="text-xs text-muted-foreground">TERC {p.terc} • SIMC {p.simc}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Ulica</label>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50"
              placeholder={placePicked ? "np. Długa…" : "Najpierw wybierz miejscowość"}
              value={streetQ}
              onChange={(e) => setStreetQ(e.target.value)}
              disabled={!placePicked}
            />

            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <div>
                {streetPicked ? (
                  <span>
                    Wybrano: <span className="font-medium text-foreground">{streetPicked.street_name}</span> • ULIC{" "}
                    {streetPicked.ulic}
                  </span>
                ) : (
                  <span>Wpisuj litery — dostaniesz listę ulic.</span>
                )}
              </div>
              <div>{streetLoading ? "szukam…" : null}</div>
            </div>

            {placePicked && !streetPicked && streetSug.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-md border border-border bg-background">
                {streetSug.map((s) => (
                  <button
                    key={`${s.ulic}-${s.street_name}`}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
                    onClick={() => {
                      setStreetPicked(s);
                      setStreetQ(s.street_name);
                      setStreetSug([]);
                      setBuildings([]);
                      lookupBuildings(placePicked.terc, placePicked.simc, s.ulic);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{s.street_name}</div>
                      <div className="text-xs text-muted-foreground">{fmt(s.buildings_count)} bud.</div>
                    </div>
                    <div className="text-xs text-muted-foreground">ULIC {s.ulic}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40"
            onClick={() => {
              setPlaceQ("");
              setPlaceSug([]);
              setPlacePicked(null);
              setStreetQ("");
              setStreetSug([]);
              setStreetPicked(null);
              setBuildings([]);
              setLookupErr(null);
            }}
          >
            Wyczyść
          </button>

          <div className="text-xs text-muted-foreground">
            {buildingsLoading ? "Ładuję budynki…" : buildings.length > 0 ? `Budynki: ${fmt(buildings.length)}` : null}
          </div>
        </div>

        {placePicked && streetPicked && (
          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Budynki na ulicy</div>

            {buildingsLoading ? (
              <div className="text-sm text-muted-foreground">Ładowanie…</div>
            ) : buildings.length === 0 ? (
              <div className="text-sm text-muted-foreground">Brak wyników.</div>
            ) : (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Nr budynku</th>
                      <th className="py-2 pr-3">TERC</th>
                      <th className="py-2 pr-3">SIMC</th>
                      <th className="py-2 pr-3">ULIC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildings.map((b, idx) => (
                      <tr key={`${b.building_no}-${idx}`} className="border-t border-border">
                        <td className="py-2 pr-3 font-medium">{b.building_no}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{b.terc}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{b.simc}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{b.ulic || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Tip: kliknij <span className="font-medium">Pobierz</span> → jeśli “Zmienione: tak”, kliknij{" "}
        <span className="font-medium">Uruchom deltę</span>. Wszystko live, bez “czy to działa?”.
      </div>
    </div>
  );
}