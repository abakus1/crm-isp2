"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SimpleModal } from "@/components/SimpleModal";
import { PrgAddressFinder, type PrgAddressPick } from "@/components/PrgAddressFinder";
import { seedFamilies, seedPlans } from "@/lib/mockServicesConfig";
import type { ServiceFamily, ServicePlan } from "@/lib/mockServicesConfig.types";

type LocationKey = string;

type PickedLocation = {
  key: LocationKey;
  label: string;
  terc: string;
  simc: string;
  ulic: string;
  street_name: string;
  building_no: string;
};

function locKey(p: PrgAddressPick): LocationKey {
  // stabilny identyfikator UI pod zasięgi: “budynek PRG”
  // (lokal jest poza PRG — na razie nie wpływa na zasięg)
  return [p.terc, p.simc, p.ulic, p.building_no].join(":");
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs bg-muted/20">{children}</span>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {desc && <div className="text-xs text-muted-foreground mt-1">{desc}</div>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function CoveragePage() {
  const [families] = useState<ServiceFamily[]>(seedFamilies());
  const [plans] = useState<ServicePlan[]>(seedPlans());

  // --- wybór lokalizacji (budynek PRG)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<PickedLocation | null>(null);

  // --- UI state: location_id ↔ plan_id ↔ available
  // (UI-only; backend później)
  const [coverage, setCoverage] = useState<Record<LocationKey, Record<string, boolean>>>(() => ({}));

  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [mode, setMode] = useState<"plans" | "families">("plans");

  const famById = useMemo(() => new Map(families.map((f) => [f.id, f])), [families]);

  const visiblePlans = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return plans
      .filter((p) => (showArchived ? true : p.status !== "archived"))
      .filter((p) => {
        if (!needle) return true;
        const fam = famById.get(p.familyId)?.name ?? "";
        return (p.name + " " + p.billingProductCode + " " + fam).toLowerCase().includes(needle);
      });
  }, [plans, q, showArchived, famById]);

  const grouped = useMemo(() => {
    const map = new Map<string, ServicePlan[]>();
    for (const p of visiblePlans) {
      const arr = map.get(p.familyId) ?? [];
      arr.push(p);
      map.set(p.familyId, arr);
    }
    // sort w obrębie rodziny
    for (const [fid, arr] of map.entries()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
      map.set(fid, arr);
    }

    const familiesSorted = Array.from(map.keys())
      .map((fid) => famById.get(fid))
      .filter(Boolean) as ServiceFamily[];
    familiesSorted.sort((a, b) => a.name.localeCompare(b.name));

    return familiesSorted.map((f) => ({ family: f, plans: map.get(f.id) ?? [] }));
  }, [visiblePlans, famById]);

  const loc = picked;
  const locCoverage = useMemo(() => {
    if (!loc) return null;
    return coverage[loc.key] ?? {};
  }, [coverage, loc]);

  function setPlanAvailable(locationKey: string, planId: string, available: boolean) {
    setCoverage((prev) => {
      const next = { ...prev };
      const current = next[locationKey] ? { ...next[locationKey] } : {};
      current[planId] = available;
      next[locationKey] = current;
      return next;
    });
  }

  function setFamilyAvailable(locationKey: string, familyId: string, available: boolean, familyPlans: ServicePlan[]) {
    setCoverage((prev) => {
      const next = { ...prev };
      const current = next[locationKey] ? { ...next[locationKey] } : {};
      for (const p of familyPlans) {
        current[p.id] = available;
      }
      next[locationKey] = current;
      return next;
    });
  }

  const stats = useMemo(() => {
    if (!loc || !locCoverage) return null;
    const ids = new Set(Object.keys(locCoverage));
    const enabled = Array.from(ids).filter((id) => locCoverage[id] === true).length;
    const total = ids.size;
    return { enabled, total };
  }, [loc, locCoverage]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Konfiguracja → Zasięgi</div>
          <div className="text-xs text-muted-foreground">
            UI-only: przypisujesz dostępność usług do lokalizacji PRG (budynek). Docelowo: źródło prawdy dla sprzedaży i
            panelu klienta.
          </div>
        </div>
        <Link className="text-sm underline" href="/config/services">
          Konfiguracja usług →
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Card
          title="Lokalizacja"
          desc="Wybierz budynek z PRG. Bez tego nie edytujesz zasięgu (bo nie ma do czego przypisać)."
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
              onClick={() => setPickerOpen(true)}
            >
              Wybierz z PRG
            </button>

            {picked && (
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                onClick={() => setPicked(null)}
              >
                Wyczyść
              </button>
            )}
          </div>

          <div className="mt-3 rounded-lg border bg-muted/20 p-3">
            {!picked ? (
              <div className="text-sm text-muted-foreground">Nie wybrano lokalizacji.</div>
            ) : (
              <div className="space-y-1">
                <div className="text-sm font-medium">{picked.label}</div>
                <div className="text-xs text-muted-foreground">
                  TERC <span className="font-mono">{picked.terc}</span> • SIMC <span className="font-mono">{picked.simc}</span> • ULIC{" "}
                  <span className="font-mono">{picked.ulic}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  LocationKey: <span className="font-mono">{picked.key}</span>
                </div>
                {stats && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Zaznaczone plany: <span className="font-medium text-foreground">{stats.enabled}</span> / {stats.total}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card title="Sterowanie" desc="Wszystko tutaj to mock w pamięci przeglądarki (bez zapisu).">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs text-muted-foreground mb-1">Szukaj</div>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="np. FTTH, 700, PUBLIC, GPON…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>

            <label className="block">
              <div className="text-xs text-muted-foreground mb-1">Widok</div>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
              >
                <option value="plans">Plany (dokładnie)</option>
                <option value="families">Rodziny (szybko)</option>
              </select>
              <div className="text-[11px] text-muted-foreground mt-1">
                Rodzina = skrót operacyjny. Docelowo i tak zapisujemy zasięg na poziomie planów.
              </div>
            </label>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            <span>Pokaż archiwalne plany</span>
          </label>

          <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            Zasada: lokalizacja PRG = budynek. Panel klienta i sprzedaż będą filtrować ofertę po tych checkboxach.
          </div>
        </Card>

        <Card title="Szybkie akcje" desc="Przydaje się, gdy np. oddajesz nowy budynek FTTH.">
          <div className="space-y-2">
            <button
              type="button"
              disabled={!picked}
              className="w-full rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
              onClick={() => {
                if (!picked) return;
                // zaznacz wszystko widoczne
                const locK = picked.key;
                setCoverage((prev) => {
                  const next = { ...prev };
                  const cur = next[locK] ? { ...next[locK] } : {};
                  for (const p of visiblePlans) cur[p.id] = true;
                  next[locK] = cur;
                  return next;
                });
              }}
            >
              Zaznacz wszystkie widoczne plany
            </button>

            <button
              type="button"
              disabled={!picked}
              className="w-full rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
              onClick={() => {
                if (!picked) return;
                // odznacz wszystko widoczne
                const locK = picked.key;
                setCoverage((prev) => {
                  const next = { ...prev };
                  const cur = next[locK] ? { ...next[locK] } : {};
                  for (const p of visiblePlans) cur[p.id] = false;
                  next[locK] = cur;
                  return next;
                });
              }}
            >
              Odznacz wszystkie widoczne plany
            </button>

            <button
              type="button"
              disabled={!picked}
              className="w-full rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
              onClick={() => {
                if (!picked) return;
                const locK = picked.key;
                setCoverage((prev) => ({ ...prev, [locK]: {} }));
              }}
            >
              Wyczyść zasięg dla tej lokalizacji
            </button>
          </div>
        </Card>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Mapa zasięgu usług</div>
              <div className="text-xs text-muted-foreground">
                {picked
                  ? "Zaznacz dostępne plany dla wybranego budynku PRG."
                  : "Najpierw wybierz lokalizację PRG (budynek), żeby edytować zasięg."}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Rodzin: {grouped.length} • Planów: {visiblePlans.length}</div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {grouped.length === 0 ? (
            <div className="text-sm text-muted-foreground">Brak wyników.</div>
          ) : (
            grouped.map(({ family, plans: famPlans }) => {
              const allChecked =
                !!picked &&
                famPlans.length > 0 &&
                famPlans.every((p) => (coverage[picked.key]?.[p.id] ?? false) === true);
              const anyChecked =
                !!picked && famPlans.some((p) => (coverage[picked.key]?.[p.id] ?? false) === true);

              return (
                <div key={family.id} className="rounded-xl border bg-muted/10">
                  <div className="p-3 border-b flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">{family.name}</div>
                      <Badge>{famPlans.length} planów</Badge>
                      {family.status === "archived" && <Badge>archiwum</Badge>}
                    </div>

                    <div className="flex items-center gap-2">
                      {mode === "families" && (
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            disabled={!picked}
                            checked={allChecked}
                            ref={(el) => {
                              // tri-state UI: indeterminate gdy “częściowo”
                              if (!el) return;
                              el.indeterminate = Boolean(picked) && anyChecked && !allChecked;
                            }}
                            onChange={(e) => {
                              if (!picked) return;
                              setFamilyAvailable(picked.key, family.id, e.target.checked, famPlans);
                            }}
                          />
                          <span className="text-sm">Dostępna (rodzina)</span>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {famPlans.map((p) => {
                        const checked = picked ? (coverage[picked.key]?.[p.id] ?? false) : false;
                        return (
                          <label
                            key={p.id}
                            className={[
                              "flex items-start gap-2 rounded-lg border bg-background p-3",
                              checked ? "border-primary/40" : "",
                            ].join(" ")}
                          >
                            <input
                              type="checkbox"
                              disabled={!picked}
                              checked={checked}
                              onChange={(e) => {
                                if (!picked) return;
                                setPlanAvailable(picked.key, p.id, e.target.checked);
                              }}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-medium truncate">{p.name}</div>
                                <Badge>{p.type === "primary" ? "primary" : "addon"}</Badge>
                                {p.status === "archived" && <Badge>arch</Badge>}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-1">
                                Code: <span className="font-mono">{p.billingProductCode || "—"}</span>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <SimpleModal
        open={pickerOpen}
        title="Wybierz lokalizację (PRG)"
        description="Wybierz: miejscowość → ulica → budynek. To będzie klucz zasięgu."
        onClose={() => setPickerOpen(false)}
        className="w-[min(90vw,1100px)] h-[min(80vh,900px)] max-w-none"
        bodyClassName="p-4"
      >
        <PrgAddressFinder
          onPick={(p) => {
            const key = locKey(p);
            setPicked({
              key,
              label: `${p.place_name}, ${p.street_name} ${p.building_no}`,
              terc: p.terc,
              simc: p.simc,
              ulic: p.ulic,
              street_name: p.street_name,
              building_no: p.building_no,
            });
            setCoverage((prev) => (prev[key] ? prev : { ...prev, [key]: {} }));
            setPickerOpen(false);
          }}
        />
      </SimpleModal>
    </div>
  );
}
