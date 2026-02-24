"use client";

import { useMemo, useState } from "react";
import { SimpleModal } from "@/components/SimpleModal";

export type EffectiveAtDecision =
  | { mode: "now" }
  | { mode: "scheduled"; effectiveAtIso: string };

export function EffectiveAtModal({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (decision: EffectiveAtDecision) => void;
}) {
  const [mode, setMode] = useState<"now" | "scheduled">("now");
  const [dt, setDt] = useState<string>("");

  const canConfirm = useMemo(() => {
    if (mode === "now") return true;
    return dt.trim().length >= 10;
  }, [mode, dt]);

  return (
    <SimpleModal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <div className="flex gap-2 justify-end">
          <button className="px-3 py-2 rounded-md border" onClick={onClose}>
            Anuluj
          </button>
          <button
            className={[
              "px-3 py-2 rounded-md",
              canConfirm ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            ].join(" ")}
            disabled={!canConfirm}
            onClick={() => {
              if (mode === "now") return onConfirm({ mode: "now" });
              // datetime-local zwraca bez strefy; trzymamy jako ISO-like string do payloadu
              return onConfirm({ mode: "scheduled", effectiveAtIso: dt });
            }}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === "now"} onChange={() => setMode("now")} />
            <span>Natychmiast</span>
          </label>
          <div className="text-xs text-muted-foreground mt-1">
            Zmiana zacznie obowiązywać od razu.
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === "scheduled"} onChange={() => setMode("scheduled")} />
            <span>Zaplanuj</span>
          </label>
          <div className="mt-2">
            <label className="text-xs text-muted-foreground">Obowiązuje od</label>
            <input
              type="datetime-local"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
            <div className="text-xs text-muted-foreground mt-1">
              To jest "ślepe" UI — backend później zamieni to na realny kalendarz zmian.
            </div>
          </div>
        </div>
      </div>
    </SimpleModal>
  );
}
