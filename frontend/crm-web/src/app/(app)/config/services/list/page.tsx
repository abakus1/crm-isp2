"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { SimpleModal } from "@/components/SimpleModal";
import { EffectiveAtModal, EffectiveAtDecision } from "@/components/services/EffectiveAtModal";
import { formatStatus, seedFamilies, seedPlans, seedTerms } from "@/lib/mockServicesConfig";
import type { ServiceFamily, ServicePlan, ServiceTerm } from "@/lib/mockServicesConfig.types";

type ServiceRow = {
  id: string;
  name: string;
  type: ServicePlan["type"];
  familyName: string;
  termName: string;
  status: ServicePlan["status"];
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
  const [q, setQ] = useState<string>("");

  const familyById = useMemo(() => new Map(families.map((f) => [f.id, f])), [families]);
  const termById = useMemo(() => new Map(terms.map((t) => [t.id, t])), [terms]);

  const rows: ServiceRow[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return plans
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        familyName: familyById.get(p.familyId)?.name || "—",
        termName: termById.get(p.termId)?.name || "—",
        status: p.status,
        subscribersCount: p.subscribersCount ?? 0,
        effectiveFrom: p.effectiveFrom,
        month1Price: p.monthPrices?.[0] ?? 0,
        activationFee: p.activationFee ?? 0,
        saleFrom: p.saleFrom ?? "",
        saleTo: p.saleTo ?? null,
      }))
      .filter((r) => (filterStatus === "all" ? true : r.status === filterStatus))
      .filter((r) => {
        if (!needle) return true;
        const hay = `${r.name} ${r.familyName} ${r.termName}`.toLowerCase();
        return hay.includes(needle);
      });
  }, [plans, familyById, termById, filterStatus, q]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function requestDelete(planId: string) {
    setDeleteId(planId);
    setDeleteOpen(true);
  }

  function doDelete() {
    if (!deleteId) return;
    setPlans((prev) => prev.filter((p) => p.id !== deleteId));
    setDeleteOpen(false);
    setDeleteId(null);
  }

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionCtx, setDecisionCtx] = useState<{
    kind: "archive" | "restore";
    planId: string;
  } | null>(null);

  function askArchive(planId: string) {
    setDecisionCtx({ kind: "archive", planId });
    setDecisionOpen(true);
  }

  function askRestore(planId: string) {
    setDecisionCtx({ kind: "restore", planId });
    setDecisionOpen(true);
  }

  function todayIso() {
  return new Date().toISOString().slice(0, 10);
  }

  function resolveEffectiveFrom(decision: EffectiveAtDecision): string {
    // EffectiveAtDecision to union: np. { mode: "now" } | { mode: "at"; effectiveAt: string }
    // TS: nie zakładamy, że effectiveAt istnieje zawsze.
    if ((decision as any).effectiveAt) return (decision as any).effectiveAt as string;
    return todayIso();
  }

  function applyDecision(decision: EffectiveAtDecision) {
    if (!decisionCtx) return;

    const { kind, planId } = decisionCtx;
    const eff = resolveEffectiveFrom(decision);

    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;

        const nextStatus = kind === "archive" ? "archived" : "active";
        return {
          ...p,
          status: nextStatus,
          effectiveFrom: eff,
        };
      })
    );

    setDecisionOpen(false);
    setDecisionCtx(null);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Usługi</h1>
          <div className="text-sm text-muted-foreground">
            Lista wszystkich planów usług (główne + dodatki). Widok operatorski, bez backendu.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/config/services/families"
            className="px-3 py-2 rounded-md border bg-background hover:bg-muted text-sm"
          >
            Rodziny
          </Link>
          <Link
            href="/config/services/terms"
            className="px-3 py-2 rounded-md border bg-background hover:bg-muted text-sm"
          >
            Okresy umowy
          </Link>
          <Link
            href="/config/services/primary"
            className="px-3 py-2 rounded-md border bg-background hover:bg-muted text-sm"
          >
            Usługi główne
          </Link>
          <Link
            href="/config/services/addons"
            className="px-3 py-2 rounded-md border bg-background hover:bg-muted text-sm"
          >
            Dodatki
          </Link>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">Status</div>
          <div className="flex gap-2">
            {(["active", "archived", "all"] as const).map((s) => (
              <button
                key={s}
                className={`px-3 py-2 rounded-md border text-sm ${
                  filterStatus === s ? "bg-muted" : "bg-background hover:bg-muted"
                }`}
                onClick={() => setFilterStatus(s)}
              >
                {s === "all" ? "Wszystkie" : formatStatus(s)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-[220px] flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">Szukaj</div>
          <input
            className="w-full px-3 py-2 rounded-md border bg-background"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="np. Internet, TV, 24 miesiące..."
          />
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-medium bg-muted">
          <div className="col-span-3">Nazwa</div>
          <div className="col-span-2">Rodzina</div>
          <div className="col-span-2">Okres</div>
          <div className="col-span-1">Typ</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1">Abonenci</div>
          <div className="col-span-1">Cena m1</div>
          <div className="col-span-1 text-right">Akcje</div>
        </div>

        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-t items-center">
            <div className="col-span-3">
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground">Aktywne od: {r.effectiveFrom}</div>
            </div>

            <div className="col-span-2">{r.familyName}</div>
            <div className="col-span-2">{r.termName}</div>

            <div className="col-span-1">
              <Pill>{r.type}</Pill>
            </div>

            <div className="col-span-1">{formatStatus(r.status)}</div>

            <div className="col-span-1">{r.subscribersCount}</div>

            <div className="col-span-1">
              <div className="text-sm">{r.month1Price} PLN</div>
              <div className="text-xs text-muted-foreground">Akt.: {r.activationFee} PLN</div>
            </div>

            <div className="col-span-1 text-right">
              <div className="inline-flex items-center justify-end gap-2">
                <Link
                  href={
                    r.type === "primary"
                      ? `/config/services/primary?edit=${encodeURIComponent(r.id)}`
                      : `/config/services/addons?edit=${encodeURIComponent(r.id)}`
                  }
                  className="px-3 py-2 rounded-md border bg-background hover:bg-muted text-sm"
                >
                  Edytuj
                </Link>

                {r.status === "active" ? (
                  <button
                    className="px-3 py-2 rounded-md border bg-background hover:bg-muted text-sm"
                    onClick={() => askArchive(r.id)}
                  >
                    Archiwizuj
                  </button>
                ) : (
                  <button
                    className="px-3 py-2 rounded-md border bg-background hover:bg-muted text-sm"
                    onClick={() => askRestore(r.id)}
                  >
                    Przywróć
                  </button>
                )}

                {r.subscribersCount === 0 ? (
                  <button
                    className="px-3 py-2 rounded-md border bg-background hover:bg-muted text-sm text-destructive"
                    onClick={() => requestDelete(r.id)}
                    title="Brak sprzedaży — można usunąć."
                  >
                    Usuń
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <EffectiveAtModal
      open={decisionOpen}
      title={decisionCtx?.kind === "archive" ? "Archiwizuj usługę" : "Przywróć usługę"}
      description="Ustaw od kiedy zmiana ma obowiązywać."
      confirmLabel={decisionCtx?.kind === "archive" ? "Archiwizuj" : "Przywróć"}
      onClose={() => setDecisionOpen(false)}
      onConfirm={applyDecision}
      />


      <SimpleModal
        open={deleteOpen}
        title="Usuń usługę"
        description="Możesz usunąć tylko usługę, która nigdy nie była sprzedana (abonenci = 0). Ślepe UI — tylko w pamięci."
        onClose={() => setDeleteOpen(false)}
        children={
          <div className="text-sm text-muted-foreground">
            Ta akcja usuwa usługę wyłącznie z lokalnego stanu UI (brak backendu).
          </div>
        }
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
      />
    </div>
  );
}