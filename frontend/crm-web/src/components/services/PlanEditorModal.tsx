"use client";

import { useMemo, useState } from "react";
import { SimpleModal } from "@/components/SimpleModal";
import { EffectiveAtDecision, EffectiveAtModal } from "@/components/services/EffectiveAtModal";
import { ServiceFamily, ServicePlan, ServiceTerm } from "@/lib/mockServicesConfig";

export type PlanEditorResult = {
  planPatch: Partial<ServicePlan>;
  decision: EffectiveAtDecision;
};

export function PlanEditorModal({
  open,
  mode,
  plan,
  families,
  terms,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "new" | "edit";
  plan: ServicePlan | null;
  families: ServiceFamily[];
  terms: ServiceTerm[];
  onClose: () => void;
  onSave: (res: PlanEditorResult) => void;
}) {
  const [name, setName] = useState(plan?.name ?? "");
  const [familyId, setFamilyId] = useState(plan?.familyId ?? (families[0]?.id ?? ""));
  const [termId, setTermId] = useState(plan?.termId ?? (terms[0]?.id ?? ""));
  const [billingProductCode, setBillingProductCode] = useState(plan?.billingProductCode ?? "");
  const [month1Price, setMonth1Price] = useState<string>(plan ? String(plan.month1Price) : "");

  const [effectiveOpen, setEffectiveOpen] = useState(false);

  const canSave = useMemo(() => {
    if (name.trim() === "") return false;
    if (!familyId || !termId) return false;
    if (billingProductCode.trim() === "") return false;
    const p = Number(month1Price);
    if (Number.isNaN(p) || p < 0) return false;
    return true;
  }, [name, familyId, termId, billingProductCode, month1Price]);

  // reset when opening different plan
  useMemo(() => {
    if (!open) return;
    setName(plan?.name ?? "");
    setFamilyId(plan?.familyId ?? (families[0]?.id ?? ""));
    setTermId(plan?.termId ?? (terms[0]?.id ?? ""));
    setBillingProductCode(plan?.billingProductCode ?? "");
    setMonth1Price(plan ? String(plan.month1Price) : "");
  }, [open, plan, families, terms]);

  return (
    <>
      <SimpleModal
        open={open}
        title={mode === "new" ? "Dodaj plan" : "Edytuj plan"}
        description="Ślepe UI — zapis i harmonogram tylko w pamięci."
        onClose={onClose}
        footer={
          <div className="flex justify-end gap-2">
            <button className="px-3 py-2 rounded-md border" onClick={onClose}>
              Anuluj
            </button>
            <button
              className={[
                "px-3 py-2 rounded-md",
                canSave ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              ].join(" ")}
              disabled={!canSave}
              onClick={() => setEffectiveOpen(true)}
            >
              {mode === "new" ? "Dodaj" : "Zapisz zmiany"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Nazwa</div>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Kategoria</div>
              <select value={familyId} onChange={(e) => setFamilyId(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Okres</div>
              <select value={termId} onChange={(e) => setTermId(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Billing product code</div>
              <input
                value={billingProductCode}
                onChange={(e) => setBillingProductCode(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
                placeholder="np. INTERNET_300"
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Cena (miesiąc 1)</div>
              <input
                value={month1Price}
                onChange={(e) => setMonth1Price(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="np. 69"
              />
            </div>
          </div>

          <div className="rounded-xl border p-3 bg-muted/20">
            <div className="text-sm font-medium">Harmonogram zmian</div>
            <div className="text-xs text-muted-foreground mt-1">
              Po kliknięciu "Zapisz" wybierzesz: natychmiast vs zaplanuj. Backend dopniemy później.
            </div>
          </div>
        </div>
      </SimpleModal>

      <EffectiveAtModal
        open={effectiveOpen}
        title={mode === "new" ? "Dodanie planu" : "Edycja planu"}
        description="Wybierz kiedy zmiana ma obowiązywać."
        confirmLabel={mode === "new" ? "Dodaj plan" : "Zaplanuj zmianę"}
        onClose={() => setEffectiveOpen(false)}
        onConfirm={(decision) => {
          setEffectiveOpen(false);
          onSave({
            decision,
            planPatch: {
              name: name.trim(),
              familyId,
              termId,
              billingProductCode: billingProductCode.trim(),
              month1Price: Number(month1Price),
            },
          });
        }}
      />
    </>
  );
}
