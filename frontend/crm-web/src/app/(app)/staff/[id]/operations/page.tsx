"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";

type ActivityItem = {
  id: number;
  occurred_at: string;
  username?: string | null;
  ip?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  message?: string | null;
  meta?: Record<string, any> | null;
};

type ActivityList = {
  items: ActivityItem[];
  next_cursor?: string | null;
  has_more: boolean;
  limit: number;
};

function fmtTs(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted/20 px-2 py-0.5 text-[11px]">
      {children}
    </span>
  );
}

export default function StaffOperationsPage() {
  const { token, logout } = useAuth();
  const perms = usePermissions();
  const router = useRouter();
  const params = useParams();
  const staffId = Number(params?.id);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  function handleUnauthorized() {
    logout();
    router.replace("/login");
  }

  const canRead = perms.has("activity.read_all");

  const queryUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "20");
    if (cursor) p.set("cursor", cursor);
    if (q.trim()) p.set("q", q.trim());
    if (action.trim()) p.set("action", action.trim());
    if (dateFrom) p.set("date_from", new Date(dateFrom).toISOString());
    if (dateTo) {
      // end of day
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      p.set("date_to", d.toISOString());
    }
    return `/staff/${staffId}/operations?${p.toString()}`;
  }, [staffId, cursor, q, action, dateFrom, dateTo]);

  async function load(reset: boolean) {
    if (!token) return;
    if (!canRead) {
      setError("Brak uprawnień: activity.read_all");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<ActivityList>(queryUrl, {
        method: "GET",
        token,
        onUnauthorized: handleUnauthorized,
      });

      setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
      setNextCursor(data.next_cursor || null);
      setHasMore(Boolean(data.has_more));
    } catch (e: any) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Nie udało się pobrać logów aktywności.");
    } finally {
      setBusy(false);
    }
  }

  // initial
  useEffect(() => {
    setCursor(null);
  }, [staffId]);

  useEffect(() => {
    // when cursor changes, load
    load(cursor === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  function applyFilters() {
    setItems([]);
    setNextCursor(null);
    setHasMore(false);
    setCursor(null);
  }

  function loadMore() {
    if (!nextCursor) return;
    setCursor(nextCursor);
  }

  if (!canRead) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-lg font-semibold">Operacje pracownika</div>
        <div className="text-sm text-muted-foreground">Brak uprawnień: activity.read_all</div>
        <Link href={`/staff/${staffId}`} className="text-sm underline">
          ← Wróć do kartoteki
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Operacje pracownika</div>
          <div className="text-xs text-muted-foreground">Ostatnie zdarzenia (logowania, zmiany, akcje).</div>
        </div>
        <div className="flex gap-2">
          <Link href={`/staff/${staffId}`} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60">
            ← Kartoteka
          </Link>
          <button
            onClick={() => applyFilters()}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            title="Odśwież z bieżącymi filtrami"
          >
            {busy ? "Ładuję..." : "Odśwież"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Szukaj (akcja/treść/encja)</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="np. STAFF_UPDATE, login, password…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Akcja (dokładnie)</div>
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="np. IDENTITY_LOGIN"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Od (data)</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Do (data)</div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            <span className="mr-2">Widok:</span>
            <Chip>20 / strona</Chip>
            {hasMore ? <span className="ml-2">• są starsze</span> : <span className="ml-2">• koniec</span>}
          </div>
          <button
            onClick={() => applyFilters()}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            Zastosuj filtry
          </button>
        </div>
      </div>

      {error && <div className="rounded-md border border-border bg-destructive/10 p-3 text-sm">{error}</div>}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-3 border-b border-border text-sm font-semibold">Log</div>

        <div className="divide-y divide-border">
          {items.length === 0 && !busy && (
            <div className="p-4 text-sm text-muted-foreground">Brak wpisów dla tych filtrów.</div>
          )}

          {items.map((it) => (
            <div key={it.id} className="p-4 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{it.action}</span>
                <Chip>{fmtTs(it.occurred_at)}</Chip>
                {it.ip && <Chip>IP: {it.ip}</Chip>}
                {it.username && <Chip>Login: {it.username}</Chip>}
                {(it.entity_type || it.entity_id) && (
                  <Chip>
                    {it.entity_type || "entity"}
                    {it.entity_id ? `#${it.entity_id}` : ""}
                  </Chip>
                )}
              </div>
              {it.message && <div className="text-sm">{it.message}</div>}
              {it.meta && Object.keys(it.meta).length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">Szczegóły</summary>
                  <pre className="mt-2 overflow-auto rounded-md border border-border bg-muted/20 p-3 text-[11px] leading-4">
                    {JSON.stringify(it.meta, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-border flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{items.length} wpisów wczytane</div>
          <button
            onClick={() => loadMore()}
            disabled={busy || !nextCursor}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            {busy ? "Ładuję..." : nextCursor ? "Załaduj starsze" : "Brak starszych"}
          </button>
        </div>
      </div>
    </div>
  );
}
