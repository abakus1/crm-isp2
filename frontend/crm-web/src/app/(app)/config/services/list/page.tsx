"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { EffectiveAtModal, EffectiveAtDecision } from "@/components/services/EffectiveAtModal";
import { formatStatus, seedFamilies, seedPlans, seedTerms } from "@/lib/mockServicesConfig";
import type { ServiceFamily, ServicePlan, ServiceTerm } from "@/lib/mockServicesConfig.types";

type ServiceRow = {
  id: string;
  name: string;
  type: "primary" | "addon";
  familyName: string;
  termName: string;
  status: "active" | "archived";
  subscribersCount: number;
  effectiveFrom: string;
  month1Price: number;
  activationFee: number;
  saleFrom: string;
  saleTo: string | null;
};

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex px-2 py-1 rounded-full text-xs bg-muted">{children}</span>;
}

export default function ServicesListPage() {
  const [families] = useState<ServiceFamily[]>(seedFamilies());
  const [terms] = useState<ServiceTerm[]>(seedTerms());
  const [plans, setPlans] = useState<ServicePlan[]>(seedPlans());

  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived">("active");
  const [filterType, setFilterType] = useState<"all" | "primary" | "addon">("all");
  const [q, setQ] = useState<string>("");

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const famById = useMemo(() => new Map(families.map((f) => [f.id, f])), [families]);
  const termById = useMemo(() => new Map(terms.map((t) => [t.id, t])), [terms]);

  const rows: ServiceRow[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return plans
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        familyName: famById.get(p.familyId)?.name || "—",
        termName: termById.get(p.termId)?.name || "—",
        status: p.status,
        subscribersCount: p.subscribersCount,
        effectiveFrom: p.effectiveFrom,
        month1Price: p.monthPrices?.[0] ?? 0,
        activationFee: p.activationFee ?? 0,
        saleFrom: p.saleFrom,
        saleTo: p.saleTo ?? null,
      }))
      .filter((r) => (filterStatus === "all" ? true : r.status === filterStatus))
      .filter((r) => (filterType === "all" ? true : r.type === filterType))
      .filter((r) => (needle ? r.name.toLowerCase().includes(needle) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [plans, famById, termById, filterStatus, filterType, q]);

  const [modalOpen, setModalOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<"archive" | "restore" | null>(null);

  function applyBulk(action: "archive" | "restore", decision: EffectiveAtDecision) {
    const ids = new Set(selectedIds);
    setPlans((prev) =>
      prev.map((p) => {
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
          <div className="text-sm font-semibold">Konfiguracja → Usługi → Lista usług</div>
          <div className="text-xs text-muted-foreground">
            Ślepe UI. Dane są mockowane i trzymane tylko w pamięci przeglądarki.
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
            placeholder="np. Internet 300"
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

        <div>
          <div className="text-xs text-muted-foreground">Typ</div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="mt-1 rounded-md border px-3 py-2 text-sm"
          >
            <option value="all">Wszystkie</option>
            <option value="primary">Główne</option>
            <option value="addon">Dodatkowe</option>
          </select>
        </div>

        {selectedIds.length > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
            <div className="text-sm">Zaznaczone: {selectedIds.length}</div>
            <button
              className="px-3 py-1.5 rounded-md border"
              onClick={() => {
                setBulkAction("archive");
                setModalOpen(true);
              }}
            >
              Archiwizuj
            </button>
            <button
              className="px-3 py-1.5 rounded-md border"
              onClick={() => {
                setBulkAction("restore");
                setModalOpen(true);
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
              <th className="p-3 text-left">Usługa</th>
              <th className="p-3 text-left">Typ</th>
              <th className="p-3 text-left">Kategoria</th>
              <th className="p-3 text-left">Okres</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-right">Subskrybenci</th>
              <th className="p-3 text-right">M1 (zł)</th>
              <th className="p-3 text-right">Aktywacja (zł)</th>
              <th className="p-3 text-left">Sprzedaż (od–do)</th>
              <th className="p-3 text-left">Obowiązuje od</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                <td className="p-3">{r.type === "primary" ? <Pill>Główna</Pill> : <Pill>Dodatkowa</Pill>}</td>
                <td className="p-3">{r.familyName}</td>
                <td className="p-3">{r.termName}</td>
                <td className="p-3">{formatStatus(r.status)}</td>
                <td className="p-3 text-right tabular-nums">{r.subscribersCount}</td>
                <td className="p-3 text-right tabular-nums">{r.month1Price.toFixed(2)}</td>
                <td className="p-3 text-right tabular-nums">{r.activationFee.toFixed(2)}</td>
                <td className="p-3">
                  <div className="tabular-nums">{r.saleFrom}</div>
                  <div className="tabular-nums text-xs text-muted-foreground">{r.saleTo ?? "—"}</div>
                </td>
                <td className="p-3">{r.effectiveFrom}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-muted-foreground">
                  Brak wyników
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EffectiveAtModal
        open={modalOpen}
        title={bulkAction === "archive" ? "Archiwizacja (grupowo)" : "Przywracanie (grupowo)"}
        description="Wybierz kiedy zmiana ma obowiązywać. To jest ślepe UI — backend podepniemy później."
        confirmLabel={bulkAction === "archive" ? "Zaplanuj archiwizację" : "Zaplanuj przywrócenie"}
        onClose={() => setModalOpen(false)}
        onConfirm={(decision) => {
          if (!bulkAction) return;
          applyBulk(bulkAction, decision);
          setModalOpen(false);
          setBulkAction(null);
        }}
      />
    </div>
  );
}
