"use client";

import { useMemo, useState } from "react";

import { getClientVisibleSlots, seedWindowDefinitions } from "@/lib/mockTaskConfig";

const DAYS = ["pon", "wt", "śr", "czw", "pt", "sob", "ndz"];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function TaskWindowsConfigPage() {
  const [windows] = useState(() => seedWindowDefinitions());
  const [previewDate, setPreviewDate] = useState("2026-03-10");
  const connectionSlots = useMemo(() => getClientVisibleSlots(previewDate, "connection"), [previewDate]);
  const serviceSlots = useMemo(() => getClientVisibleSlots(previewDate, "service_visit"), [previewDate]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → Zadania → Okna czasowe</div>
        <div className="text-xs text-muted-foreground">
          Definicje slotów dla automatu. Klient ma zobaczyć wolny termin, a nie cudzy grafik od A do Z. Tutaj ustalamy kiedy, jak długo i ile wizyt system może proponować.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {windows.map((windowDef) => (
            <div key={windowDef.id} className="rounded-2xl border bg-card p-4">
              <div className="text-sm font-semibold">{windowDef.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">Dotyczy: {windowDef.taskCodes.join(", ")}</div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Dni</div>
                  <div className="mt-1 text-sm font-medium">{windowDef.daysOfWeek.map((day) => DAYS[day - 1]).join(", ")}</div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Zakres godzin</div>
                  <div className="mt-1 text-sm font-medium">{`${String(windowDef.startHour).padStart(2, "0")}:00–${String(windowDef.endHour).padStart(2, "0")}:00`}</div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Długość slotu</div>
                  <div className="mt-1 text-sm font-medium">{windowDef.slotDurationMinutes} min</div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Pojemność równoległa</div>
                  <div className="mt-1 text-sm font-medium">{windowDef.parallelSlots}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-4">
          <div>
            <div className="text-sm font-semibold">Podgląd wolnych slotów</div>
            <div className="mt-1 text-xs text-muted-foreground">Mock liczy sloty na podstawie okna + zajętości ekip. Czyli już nie wróżymy z fusów.</div>
          </div>
          <label className="block space-y-1.5">
            <div className="text-sm font-medium">Dzień podglądu</div>
            <input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </label>

          <div className="space-y-2">
            <div className="text-sm font-medium">Podłączenia</div>
            {connectionSlots.length === 0 ? <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Brak wolnych okien.</div> : connectionSlots.map((slot) => <div key={slot.slotId} className="rounded-lg border p-3 text-sm"><div className="font-medium">{formatDateTime(slot.startsAt)} → {formatTime(slot.endsAt)}</div><div className="mt-1 text-xs text-muted-foreground">pojemność: {slot.remainingCapacity} · ekipy: {slot.eligibleTeamNames.join(", ")}</div></div>)}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Serwis / wizyty</div>
            {serviceSlots.length === 0 ? <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Brak wolnych okien.</div> : serviceSlots.slice(0, 8).map((slot) => <div key={slot.slotId} className="rounded-lg border p-3 text-sm"><div className="font-medium">{formatDateTime(slot.startsAt)} → {formatTime(slot.endsAt)}</div><div className="mt-1 text-xs text-muted-foreground">pojemność: {slot.remainingCapacity} · ekipy: {slot.eligibleTeamNames.join(", ")}</div></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
