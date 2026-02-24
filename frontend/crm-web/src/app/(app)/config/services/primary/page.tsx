"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EffectiveAtModal, EffectiveAtDecision } from "@/components/services/EffectiveAtModal";
import { PlanEditorModal } from "@/components/services/PlanEditorModal";
import {
  formatStatus,
  seedFamilies,
  seedPlans,
  seedTerms,
  ServiceFamily,
  ServicePlan,
  ServiceTerm,
} from "@/lib/mockServicesConfig";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

export default function PrimaryPlansPage() {
  const [families] = useState<ServiceFamily[]>(seedFamilies());
  const [terms] = useState<ServiceTerm[]>(seedTerms());
  const [plans, setPlans] = useState<ServicePlan[]>(seedPlans());

  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived">("active");
  const [q, setQ] = useState<string>("");

  const primary = useMemo(() => plans.filter((p) => p.type === "primary"), [plans]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return primary
      .filter((p) => (filterStatus === "all" ? true : p.status === filterStatus))
      .filter((p) => (needle ? (p.name + " " + p.billingProductCode).toLowerCase().includes(needle) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [primary, filterStatus, q]);

  const famById = useMemo(() => new Map(families.map((f) => [f.id, f.name])), [families]);
  const termById = useMemo(() => new Map(terms.map((t) => [t.id, t.name])), [terms]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const [bulkAction, setBulkAction] = useState<"archive" | "restore" | null>(null);
  const [effectiveOpen, setEffectiveOpen] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"new" | "edit">("new");
  const [editing, setEditing] = useState<ServicePlan | null>(null);

  function applyBulk(action: "archive" | "restore", decision: EffectiveAtDecision) {
    const ids = new Set(selectedIds);
    setPlans((prev) =>
      prev.map((p) => {
        if (p.type !== "primary") return p;
        if (!ids.has(p.id)) return p;
        const nextStatus = action === "archive" ? "archived" : "active";
        const effectiveFrom = decision.mode === "now" ? new Date().toISOString().slice(0, 10) : decision.effectiveAtIso;
        return { ...p, status: nextStatus, effectiveFrom };
      })
    );
    setSelected({});
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Konfiguracja → Usługi → Usługi główne</div>
          <div className="text-xs text-muted-foreground">
            Definicja planów primary: ceny miesięczne, opłata aktywacyjna, okno sprzedaży, podwyżki i zależności addonów.
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
            placeholder="np. INTERNET_300"
            className="mt-1 rounded-md border px-3 py-2 text-sm w-72"
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

        <button
          className="ml-auto px-3 py-2 rounded-md bg-primary text-primary-foreground"
          onClick={() => {
            setEditorMode("new");
            setEditing({
              id: "",
              type: "primary",
              name: "",
              familyId: families[0]?.id ?? "",
              termId: terms[0]?.id ?? "",
              billingProductCode: "",
              status: "active",
              subscribersCount: 0,
              effectiveFrom: new Date().toISOString().slice(0, 10),
              monthPrices: Array.from({ length: 24 }, () => 0),
              activationFee: 0,
              saleFrom: new Date().toISOString().slice(0, 10),
              saleTo: null,
              postTermIncreaseAmount: 0,
              isCyclic: false,
              requiredAddonPlanIds: [],
              optionalAddonPlanIds: [],
            });
            setEditorOpen(true);
          }}
        >
          + Dodaj usługę główną
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
              <th className="p-3 text-left">Plan</th>
              <th className="p-3 text-left">Kategoria</th>
              <th className="p-3 text-left">Okres</th>
              <th className="p-3 text-left">Billing code</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-right">Subskrybenci</th>
              <th className="p-3 text-right">M1 (zł)</th>
              <th className="p-3 text-right">Aktywacja (zł)</th>
              <th className="p-3 text-left">Sprzedaż (od–do)</th>
              <th className="p-3 text-left">Obowiązuje od</th>
              <th className="p-3 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {view.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={!!selected[p.id]}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                  />
                </td>
                <td className="p-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.id}</div>
                </td>
                <td className="p-3">{famById.get(p.familyId) || "—"}</td>
                <td className="p-3">{termById.get(p.termId) || "—"}</td>
                <td className="p-3 font-mono text-xs">{p.billingProductCode}</td>
                <td className="p-3">{formatStatus(p.status)}</td>
                <td className="p-3 text-right tabular-nums">{p.subscribersCount}</td>
                <td className="p-3 text-right tabular-nums">{(p.monthPrices?.[0] ?? 0).toFixed(2)}</td>
                <td className="p-3 text-right tabular-nums">{(p.activationFee ?? 0).toFixed(2)}</td>
                <td className="p-3">
                  <div className="tabular-nums">{p.saleFrom}</div>
                  <div className="tabular-nums text-xs text-muted-foreground">{p.saleTo ?? "—"}</div>
                </td>
                <td className="p-3">{p.effectiveFrom}</td>
                <td className="p-3 text-right">
                  <button
                    className="px-3 py-1.5 rounded-md border"
                    onClick={() => {
                      setEditorMode("edit");
                      setEditing(p);
                      setEditorOpen(true);
                    }}
                  >
                    Edytuj
                  </button>
                </td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr>
                <td colSpan={12} className="p-6 text-center text-muted-foreground">
                  Brak wyników
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PlanEditorModal
        open={editorOpen}
        mode={editorMode}
        plan={editing}
        families={families.filter((f) => f.status === "active")}
        terms={terms.filter((t) => t.status === "active")}
        allPlans={plans}
        onClose={() => setEditorOpen(false)}
        onSave={({ planPatch, decision }) => {
          const effectiveFrom =
            decision.mode === "now" ? new Date().toISOString().slice(0, 10) : decision.effectiveAtIso;
          if (editorMode === "new") {
            setPlans((prev) => [
              ...prev,
              {
                id: uid("plan"),
                type: "primary",
                status: "active",
                subscribersCount: 0,
                effectiveFrom,
                ...planPatch,
              } as ServicePlan,
            ]);
          } else if (editing) {
            setPlans((prev) =>
              prev.map((x) => (x.id === editing.id ? ({ ...x, ...planPatch, effectiveFrom } as ServicePlan) : x))
            );
          }
          setEditorOpen(false);
        }}
      />

      <EffectiveAtModal
        open={effectiveOpen}
        title={
          bulkAction === "archive"
            ? "Archiwizacja usług głównych (grupowo)"
            : "Przywracanie usług głównych (grupowo)"
        }
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
