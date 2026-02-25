"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EffectiveAtModal, EffectiveAtDecision } from "@/components/services/EffectiveAtModal";
import { SimpleModal } from "@/components/SimpleModal";
import { formatStatus, seedFamilies, seedPlans } from "@/lib/mockServicesConfig";
import type { ServiceFamily } from "@/lib/mockServicesConfig.types";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

export default function ServiceFamiliesPage() {
  const [rows, setRows] = useState<ServiceFamily[]>(seedFamilies());
  const [plans] = useState(seedPlans());

  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived">("active");
  const [q, setQ] = useState<string>("");

  const attachedCountByFamily = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plans) m.set(p.familyId, (m.get(p.familyId) ?? 0) + 1);
    return m;
  }, [plans]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (filterStatus === "all" ? true : r.status === filterStatus))
      .filter((r) => (needle ? (r.name + " " + r.code).toLowerCase().includes(needle) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, filterStatus, q]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<"new" | "edit">("new");
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const [effectiveOpen, setEffectiveOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<"archive" | "restore" | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function openNew() {
    setEditMode("new");
    setEditId(null);
    setCode("");
    setName("");
    setEditOpen(true);
  }

  function openEdit(r: ServiceFamily) {
    setEditMode("edit");
    setEditId(r.id);
    setCode(r.code);
    setName(r.name);
    setEditOpen(true);
  }

  function save() {
    const now = new Date().toISOString().slice(0, 10);
    if (editMode === "new") {
      const id = uid("fam");
      setRows((prev) => [...prev, { id, code: code.trim(), name: name.trim(), status: "active", effectiveFrom: now }]);
    } else if (editId) {
      setRows((prev) => prev.map((r) => (r.id === editId ? { ...r, code: code.trim(), name: name.trim() } : r)));
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

  function requestDelete(id: string) {
    setDeleteId(id);
    setDeleteOpen(true);
  }

  function doDelete() {
    if (!deleteId) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteId));
    setDeleteOpen(false);
    setDeleteId(null);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Konfiguracja → Usługi → Kategorie usług</div>
          <div className="text-xs text-muted-foreground">
            Zasada operatorska: brak podpiętych usług → można usuwać. Są podpięte usługi → tylko archiwizacja (żeby nie
            rozwalić historii/sprzedaży).
          </div>
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
            placeholder="np. INET"
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
          + Dodaj kategorię
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
              <th className="p-3 text-left">Kod</th>
              <th className="p-3 text-left">Nazwa</th>
              <th className="p-3 text-right">Usług</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Obowiązuje od</th>
              <th className="p-3 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const attached = attachedCountByFamily.get(r.id) ?? 0;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                    />
                  </td>
                  <td className="p-3 font-mono text-xs">{r.code}</td>
                  <td className="p-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.id}</div>
                  </td>
                  <td className="p-3 text-right tabular-nums">{attached}</td>
                  <td className="p-3">{formatStatus(r.status)}</td>
                  <td className="p-3">{r.effectiveFrom}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="px-3 py-1.5 rounded-md border" onClick={() => openEdit(r)}>
                        Edytuj
                      </button>
                      {attached === 0 ? (
                        <button
                          className="px-3 py-1.5 rounded-md border"
                          onClick={() => requestDelete(r.id)}
                          title="Brak podpiętych usług — można skasować."
                        >
                          Usuń
                        </button>
                      ) : (
                        <span
                          className="px-3 py-1.5 rounded-md bg-muted/40 text-muted-foreground"
                          title="Są podpięte usługi — usuwamy tylko przez archiwizację (żeby nie skasować historii)."
                        >
                          Usuń (zabl.)
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
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
        title={editMode === "new" ? "Dodaj kategorię" : "Edytuj kategorię"}
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
              disabled={code.trim() === "" || name.trim() === ""}
            >
              Zapisz
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Kod</div>
            <input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Nazwa</div>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
          </div>
        </div>
      </SimpleModal>

      <EffectiveAtModal
        open={effectiveOpen}
        title={bulkAction === "archive" ? "Archiwizacja kategorii (grupowo)" : "Przywracanie kategorii (grupowo)"}
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

      <SimpleModal
        open={deleteOpen}
        title="Usuń kategorię usług"
        description="Ta operacja jest dostępna tylko gdy kategoria nie ma podpiętych usług. Ślepe UI — tylko w pamięci."
        onClose={() => setDeleteOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button className="px-3 py-2 rounded-md border" onClick={() => setDeleteOpen(false)}>
              Anuluj
            </button>
            <button className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground" onClick={doDelete}>
              Usuń
            </button>
          </div>
        }
      >
        <div className="text-sm">
          Usuwasz kategorię <span className="font-mono">{deleteId}</span>. Jeśli kiedyś będą tu podpięte usługi — zamiast
          usuwać robimy archiwizację.
        </div>
      </SimpleModal>
    </div>
  );
}
