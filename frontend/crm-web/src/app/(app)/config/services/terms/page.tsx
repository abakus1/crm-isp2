"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EffectiveAtModal, EffectiveAtDecision } from "@/components/services/EffectiveAtModal";
import { SimpleModal } from "@/components/SimpleModal";
import { formatStatus, seedTerms } from "@/lib/mockServicesConfig";
import type { ServiceTerm } from "@/lib/mockServicesConfig.types";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

export default function ServiceTermsPage() {
  const [rows, setRows] = useState<ServiceTerm[]>(seedTerms());
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived">("active");
  const [q, setQ] = useState<string>("");

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (filterStatus === "all" ? true : r.status === filterStatus))
      .filter((r) => (needle ? r.name.toLowerCase().includes(needle) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, filterStatus, q]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<"new" | "edit">("new");
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isIndef, setIsIndef] = useState(true);
  const [months, setMonths] = useState<string>("");
  const [saleFrom, setSaleFrom] = useState<string>(new Date().toISOString().slice(0, 10));
  const [saleTo, setSaleTo] = useState<string>("");

  const [effectiveOpen, setEffectiveOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<"archive" | "restore" | null>(null);

  function openNew() {
    setEditMode("new");
    setEditId(null);
    setName("");
    setIsIndef(true);
    setMonths("");
    setSaleFrom(new Date().toISOString().slice(0, 10));
    setSaleTo("");
    setEditOpen(true);
  }

  function openEdit(r: ServiceTerm) {
    setEditMode("edit");
    setEditId(r.id);
    setName(r.name);
    setIsIndef(r.termMonths === null);
    setMonths(r.termMonths === null ? "" : String(r.termMonths));
    // FIX: saleFrom bywa undefined, a state oczekuje string
    setSaleFrom(r.saleFrom ?? "");
    setSaleTo(r.saleTo ?? "");
    setEditOpen(true);
  }

  function save() {
  const now = new Date().toISOString().slice(0, 10);

  let termMonths: number | null = null;

  if (!isIndef) {
    const m = Number(months);
    if (!months.trim() || Number.isNaN(m) || m <= 0) return;
    termMonths = m;
  }

  if (editMode === "new") {
    setRows((prev) => [
      ...prev,
      {
        id: uid("term"),
        name: name.trim(),
        termMonths,
        status: "active",
        effectiveFrom: now,
        saleFrom: saleFrom.trim(),
        saleTo: saleTo.trim() ? saleTo.trim() : null,
      },
    ]);
  } else if (editId) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === editId
          ? {
              ...r,
              name: name.trim(),
              termMonths,
              saleFrom: saleFrom.trim(),
              saleTo: saleTo.trim() ? saleTo.trim() : null,
            }
          : r
      )
    );
  }

  setEditOpen(false);
}

  function applyBulk(action: "archive" | "restore", decision: EffectiveAtDecision) {
    const ids = new Set(selectedIds);
    setRows((prev) =>
      prev.map((r) => {
        if (!ids.has(r.id)) return r;
        const nextStatus = action === "archive" ? "archived" : "active";
        const effectiveFrom = decision.mode === "now" ? new Date().toISOString().slice(0, 10) : decision.effectiveAtIso;
        return { ...r, status: nextStatus, effectiveFrom };
      })
    );
    setSelected({});
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Konfiguracja → Usługi → Okresy usług</div>
          <div className="text-xs text-muted-foreground">CRUD + archiwum + planowanie zmian (ślepe UI).</div>
        </div>
        <Link className="text-sm underline" href="/config/services">
          Wróć
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Szukaj</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="np. 24"
            className="mt-1 rounded-md border px-3 py-2 text-sm w-64"
          />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Status</div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="mt-1 rounded-md border px-3 py-2 text-sm"
          >
            <option value="active">Aktywne</option>
            <option value="archived">Archiwalne</option>
            <option value="all">Wszystkie</option>
          </select>
        </div>

        <button className="ml-auto px-3 py-2 rounded-md bg-primary text-primary-foreground" onClick={openNew}>
          + Dodaj okres
        </button>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
            <div className="text-sm">Zaznaczone: {selectedIds.length}</div>
            <button
              className="px-3 py-1.5 rounded-md border"
              onClick={() => {
                setBulkAction("archive");
                setEffectiveOpen(true);
              }}
            >
              Archiwizuj
            </button>
            <button
              className="px-3 py-1.5 rounded-md border"
              onClick={() => {
                setBulkAction("restore");
                setEffectiveOpen(true);
              }}
            >
              Przywróć
            </button>
            <button className="px-3 py-1.5 rounded-md border" onClick={() => setSelected({})}>
              Wyczyść
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-3 w-10"></th>
              <th className="p-3 text-left">Nazwa</th>
              <th className="p-3 text-left">Długość</th>
              <th className="p-3 text-left">Sprzedaż (od–do)</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Obowiązuje od</th>
              <th className="p-3 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={!!selected[r.id]}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                  />
                </td>
                <td className="p-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.id}</div>
                </td>
                <td className="p-3">{r.termMonths === null ? "Bezterminowa" : `${r.termMonths} mies.`}</td>
                <td className="p-3">
                  <div className="tabular-nums">{r.saleFrom}</div>
                  <div className="tabular-nums text-xs text-muted-foreground">{r.saleTo ?? "—"}</div>
                </td>
                <td className="p-3">{formatStatus(r.status)}</td>
                <td className="p-3">{r.effectiveFrom}</td>
                <td className="p-3 text-right">
                  <button className="px-3 py-1.5 rounded-md border" onClick={() => openEdit(r)}>
                    Edytuj
                  </button>
                </td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Brak wyników
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SimpleModal
        open={editOpen}
        title={editMode === "new" ? "Dodaj okres" : "Edytuj okres"}
        description="Ślepe UI — zapis tylko w pamięci."
        onClose={() => setEditOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button className="px-3 py-2 rounded-md border" onClick={() => setEditOpen(false)}>
              Anuluj
            </button>
            <button
              className="px-3 py-2 rounded-md bg-primary text-primary-foreground"
              onClick={save}
              disabled={name.trim() === "" || (!isIndef && months.trim() === "")}
            >
              Zapisz
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Nazwa</div>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isIndef} onChange={(e) => setIsIndef(e.target.checked)} />
              <span>Bezterminowa</span>
            </label>
            {!isIndef && (
              <div className="mt-2">
                <div className="text-xs text-muted-foreground">Liczba miesięcy</div>
                <input
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="np. 24"
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Okno sprzedaży / użycia</div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">Od</div>
                <input
                  value={saleFrom}
                  onChange={(e) => setSaleFrom(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Do (opcjonalnie)</div>
                <input
                  value={saleTo}
                  onChange={(e) => setSaleTo(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="YYYY-MM-DD"
                />
              </div>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Ta data będzie później użyta do blokowania sprzedaży nowych umów w UI handlowca.
            </div>
          </div>
        </div>
      </SimpleModal>

      <EffectiveAtModal
        open={effectiveOpen}
        title={bulkAction === "archive" ? "Archiwizacja okresów (grupowo)" : "Przywracanie okresów (grupowo)"}
        description="Wybierz kiedy zmiana ma obowiązywać."
        confirmLabel={bulkAction === "archive" ? "Zaplanuj archiwizację" : "Zaplanuj przywrócenie"}
        onClose={() => setEffectiveOpen(false)}
        onConfirm={(decision) => {
          if (!bulkAction) return;
          applyBulk(bulkAction, decision);
          setEffectiveOpen(false);
          setBulkAction(null);
        }}
      />
    </div>
  );
}