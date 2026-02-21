"use client";

import type { OverrideEffect, ResolvedAction } from "./types";
import { Pill } from "./ui";

export function PermissionsPanel({
  show,
  onClose,
  canPermRead,
  canPermWrite,
  saving,
  busy,
  q,
  setQ,
  resolved,
  filtered,
  overrides,
  dirtyOverrides,
  setOverride,
  saveOverrides,
}: {
  show: boolean;
  onClose: () => void;
  canPermRead: boolean;
  canPermWrite: boolean;
  saving: boolean;
  busy: boolean;
  q: string;
  setQ: (v: string) => void;
  resolved: ResolvedAction[];
  filtered: ResolvedAction[];
  overrides: Record<string, OverrideEffect>;
  dirtyOverrides: boolean;
  setOverride: (code: string, v: OverrideEffect) => void;
  saveOverrides: () => Promise<void>;
}) {
  if (!show) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border-b border-border">
        <div>
          <div className="text-sm font-medium">Uprawnienia (rola + override)</div>
          <div className="text-xs text-muted-foreground">
            Kolejność: deny override → allow override → rola → brak.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj…"
            className="h-9 w-56 rounded-md border border-border bg-background px-3 text-sm"
          />
          {canPermWrite && (
            <button
              onClick={() => saveOverrides()}
              disabled={saving || busy || !dirtyOverrides}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              {saving ? "Zapisuję…" : "Zapisz"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy || saving}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            Zamknij
          </button>
        </div>
      </div>

      <div className="p-4">
        {!canPermRead ? (
          <div className="text-xs text-muted-foreground">Brak uprawnienia: staff.permissions.read</div>
        ) : resolved.length === 0 ? (
          <div className="text-xs text-muted-foreground">Brak danych.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Kod</th>
                  <th className="py-2 pr-3">Nazwa</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Źródło</th>
                  <th className="py-2 pr-3">Override</th>
                  {canPermWrite && <th className="py-2 pr-3">Zmień</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const ov = overrides[a.code] ?? null;
                  return (
                    <tr key={a.code} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-3 font-mono text-xs">{a.code}</td>
                      <td className="py-2 pr-3">
                        <div className="text-sm">{a.label_pl}</div>
                        <div className="text-xs text-muted-foreground">{a.description_pl}</div>
                      </td>
                      <td className="py-2 pr-3">
                        {a.allowed ? <Pill tone="ok" text="allow" /> : <Pill tone="muted" text="deny" />}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="text-xs text-muted-foreground">{a.source}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="text-xs">{a.override ?? "-"}</span>
                      </td>
                      {canPermWrite && (
                        <td className="py-2 pr-3">
                          <select
                            value={ov ?? "inherit"}
                            onChange={(e) => {
                              const v = e.target.value;
                              setOverride(a.code, v === "inherit" ? null : (v as OverrideEffect));
                            }}
                            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                          >
                            <option value="inherit">inherit</option>
                            <option value="allow">allow</option>
                            <option value="deny">deny</option>
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}