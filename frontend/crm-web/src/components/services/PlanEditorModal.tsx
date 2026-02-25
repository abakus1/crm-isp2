"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SimpleModal } from "@/components/SimpleModal";
import { EffectiveAtDecision, EffectiveAtModal } from "@/components/services/EffectiveAtModal";
import { ServiceFamily, ServicePlan, ServiceTerm } from "@/lib/mockServicesConfig";

export type PlanEditorResult = {
  planPatch: Partial<ServicePlan>;
  decision: EffectiveAtDecision;
};

type DepMode = "none" | "optional" | "required";

function toNumberOrNaN(s: string) {
  const n = Number(String(s).replace(",", "."));
  return n;
}

function clampMonthCount(n: number) {
  // UI kompromis: max 60 pól, żeby nie zrobić scroll-piekła.
  if (!Number.isFinite(n) || n <= 0) return 24;
  return Math.max(1, Math.min(60, Math.floor(n)));
}

function MonthPriceGrid({
  monthPrices,
  setMonthPrices,
}: {
  monthPrices: string[];
  setMonthPrices: (v: string[]) => void;
}) {
  const cols = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2";

  return (
    <div className="rounded-xl border p-3 bg-muted/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Ceny w miesiącach (M1–Mx)</div>
          <div className="text-xs text-muted-foreground mt-1">
            Domyślnie wszystkie pola są wypełnione ceną bazową oferty — możesz zmienić dowolny miesiąc.
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className={cols}>
          {monthPrices.map((v, idx) => (
            <label key={idx} className="block">
              <div className="text-[11px] text-muted-foreground">M{idx + 1}</div>
              <input
                value={v}
                onChange={(e) => {
                  const next = [...monthPrices];
                  next[idx] = e.target.value;
                  setMonthPrices(next);
                }}
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm tabular-nums"
                inputMode="decimal"
                placeholder="0"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PlanEditorModal({
  open,
  mode,
  plan,
  families,
  terms,
  allPlans,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "new" | "edit";
  plan: ServicePlan | null;
  families: ServiceFamily[];
  terms: ServiceTerm[];
  allPlans: ServicePlan[];
  onClose: () => void;
  onSave: (res: PlanEditorResult) => void;
}) {
  const isPrimary = plan?.type === "primary";

  const [name, setName] = useState(plan?.name ?? "");
  const [familyId, setFamilyId] = useState(plan?.familyId ?? (families[0]?.id ?? ""));
  const [termId, setTermId] = useState(plan?.termId ?? (terms[0]?.id ?? ""));
  const [billingProductCode, setBillingProductCode] = useState(plan?.billingProductCode ?? "");

  // "Aktualnie" – ref musi się aktualizować przy zmianie planu
  const originalActivationFeeRef = useRef<number>(plan?.activationFee ?? 0);

  const [activationFee, setActivationFee] = useState<string>(plan ? String(plan.activationFee ?? 0) : "0");

  // QoS toggles + wartości
  // ServicePlan nie ma flag downloadLimitEnabled/uploadLimitEnabled.
  // UI trzyma je lokalnie i wylicza z obecności wartości downloadBps/uploadBps.
  const [downloadLimitEnabled, setDownloadLimitEnabled] = useState<boolean>(
    plan?.downloadBps != null && String(plan?.downloadBps).trim() !== ""
  );
  const [uploadLimitEnabled, setUploadLimitEnabled] = useState<boolean>(
    plan?.uploadBps != null && String(plan?.uploadBps).trim() !== ""
  );
  const [downloadBps, setDownloadBps] = useState<string>(plan?.downloadBps != null ? String(plan.downloadBps) : "");
  const [uploadBps, setUploadBps] = useState<string>(plan?.uploadBps != null ? String(plan.uploadBps) : "");

  const [indefiniteMonthlyPrice, setIndefiniteMonthlyPrice] = useState<string>(
    plan ? String(plan.indefiniteMonthlyPrice ?? plan.monthPrices?.[plan.monthPrices.length - 1] ?? 0) : "0"
  );
  const [indefiniteActivationFee, setIndefiniteActivationFee] = useState<string>(
    plan ? String(plan.indefiniteActivationFee ?? plan.activationFee ?? 0) : "0"
  );

  const [saleFrom, setSaleFrom] = useState<string>(plan?.saleFrom ?? new Date().toISOString().slice(0, 10));
  const [saleTo, setSaleTo] = useState<string>(plan?.saleTo ?? "");

  const [postTermIncreaseAmount, setPostTermIncreaseAmount] = useState<string>(
    plan ? String(plan.postTermIncreaseAmount ?? 0) : "0"
  );
  const [isCyclic, setIsCyclic] = useState<boolean>(plan?.isCyclic ?? false);

  const initialMonthCount = useMemo(() => {
    const term = terms.find((t) => t.id === (plan?.termId ?? termId));
    // UWAGA: u Ciebie term ma pole termMonths (tak jest w starym UI)
    return clampMonthCount((term as any)?.termMonths ?? 24);
  }, [terms, plan?.termId, termId]);

  const [monthPrices, setMonthPrices] = useState<string[]>(() => {
    const n = initialMonthCount;
    const base = plan?.monthPrices?.[0] ?? 0;
    const src = plan?.monthPrices ?? [];
    const arr = Array.from({ length: n }, (_, i) => String(src[i] ?? base));
    return arr;
  });

  // Addon device requirements
  const [requiresDevice, setRequiresDevice] = useState<boolean>(plan?.requiresDevice ?? false);
  const [allowedDeviceCategories, setAllowedDeviceCategories] = useState<string>(
    (plan?.allowedDeviceCategories ?? []).join(", ")
  );

  // Dependency editor (primary)
  const addonPlans = useMemo(() => allPlans.filter((p) => p.type === "addon"), [allPlans]);
  const [depModeByAddonId, setDepModeByAddonId] = useState<Record<string, DepMode>>(() => {
    const required = new Set(plan?.requiredAddonPlanIds ?? []);
    const optional = new Set(plan?.optionalAddonPlanIds ?? []);
    const map: Record<string, DepMode> = {};
    for (const a of addonPlans) {
      if (required.has(a.id)) map[a.id] = "required";
      else if (optional.has(a.id)) map[a.id] = "optional";
      else map[a.id] = "none";
    }
    return map;
  });

  const [effectiveOpen, setEffectiveOpen] = useState(false);

  // reset when opening different plan (MUSI być useEffect)
  useEffect(() => {
    if (!open) return;

    setName(plan?.name ?? "");
    setFamilyId(plan?.familyId ?? (families[0]?.id ?? ""));
    setTermId(plan?.termId ?? (terms[0]?.id ?? ""));
    setBillingProductCode(plan?.billingProductCode ?? "");

    originalActivationFeeRef.current = plan?.activationFee ?? 0;
    setActivationFee(plan ? String(plan.activationFee ?? 0) : "0");

    // QoS
    const dlEnabled = plan?.downloadBps != null && String(plan?.downloadBps).trim() !== "";
    const ulEnabled = plan?.uploadBps != null && String(plan?.uploadBps).trim() !== "";
    setDownloadLimitEnabled(!!dlEnabled);
    setUploadLimitEnabled(!!ulEnabled);
    setDownloadBps(plan?.downloadBps != null ? String(plan.downloadBps) : "");
    setUploadBps(plan?.uploadBps != null ? String(plan.uploadBps) : "");

    setIndefiniteMonthlyPrice(
      plan ? String(plan.indefiniteMonthlyPrice ?? plan.monthPrices?.[plan.monthPrices.length - 1] ?? 0) : "0"
    );
    setIndefiniteActivationFee(plan ? String(plan.indefiniteActivationFee ?? plan.activationFee ?? 0) : "0");

    setSaleFrom(plan?.saleFrom ?? new Date().toISOString().slice(0, 10));
    setSaleTo(plan?.saleTo ?? "");

    setPostTermIncreaseAmount(plan ? String(plan.postTermIncreaseAmount ?? 0) : "0");
    setIsCyclic(plan?.isCyclic ?? false);

    const term = terms.find((t) => t.id === (plan?.termId ?? (terms[0]?.id ?? "")));
    const n = clampMonthCount((term as any)?.termMonths ?? 24);
    const base = plan?.monthPrices?.[0] ?? 0;
    const src = plan?.monthPrices ?? [];
    setMonthPrices(Array.from({ length: n }, (_, i) => String(src[i] ?? base)));

    setRequiresDevice(plan?.requiresDevice ?? false);
    setAllowedDeviceCategories((plan?.allowedDeviceCategories ?? []).join(", "));

    // deps
    const required = new Set(plan?.requiredAddonPlanIds ?? []);
    const optional = new Set(plan?.optionalAddonPlanIds ?? []);
    const map: Record<string, DepMode> = {};
    for (const a of addonPlans) {
      if (required.has(a.id)) map[a.id] = "required";
      else if (optional.has(a.id)) map[a.id] = "optional";
      else map[a.id] = "none";
    }
    setDepModeByAddonId(map);
  }, [open, plan, families, terms, addonPlans]);

  const canSave = useMemo(() => {
    if (!plan) return false;
    if (name.trim() === "") return false;
    if (!familyId || !termId) return false;
    if (billingProductCode.trim() === "") return false;

    const aFee = toNumberOrNaN(activationFee);
    if (Number.isNaN(aFee) || aFee < 0) return false;

    const inc = toNumberOrNaN(postTermIncreaseAmount);
    if (Number.isNaN(inc) || inc < 0) return false;

    // month prices
    for (const v of monthPrices) {
      const n = toNumberOrNaN(v);
      if (Number.isNaN(n) || n < 0) return false;
    }

    // sale window basic sanity
    if (!saleFrom) return false;

    // QoS (jeśli włączone, musi być liczbą >=0)
    if (isPrimary) {
      if (downloadLimitEnabled) {
        const n = toNumberOrNaN(downloadBps);
        if (Number.isNaN(n) || n < 0) return false;
      }
      if (uploadLimitEnabled) {
        const n = toNumberOrNaN(uploadBps);
        if (Number.isNaN(n) || n < 0) return false;
      }
    }

    return true;
  }, [
    plan,
    name,
    familyId,
    termId,
    billingProductCode,
    activationFee,
    postTermIncreaseAmount,
    monthPrices,
    saleFrom,
    isPrimary,
    downloadLimitEnabled,
    uploadLimitEnabled,
    downloadBps,
    uploadBps,
  ]);

  const termMonths = useMemo(() => {
    const t = terms.find((x) => x.id === termId) as any;
    return t?.termMonths ?? null;
  }, [terms, termId]);

  return (
    <>
      <SimpleModal
        open={open}
        title={mode === "new" ? "Dodaj usługę" : "Edytuj usługę"}
        description="Ślepe UI — zapis i harmonogram tylko w pamięci. Backend dopniemy później."
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
        {!plan ? (
          <div className="p-4 text-sm text-muted-foreground">Brak danych planu.</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground">Nazwa</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Kategoria</div>
                <select
                  value={familyId}
                  onChange={(e) => setFamilyId(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                >
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Okres</div>
                <select
                  value={termId}
                  onChange={(e) => setTermId(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                >
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Billing product code</div>
                <input
                  value={billingProductCode}
                  onChange={(e) => setBillingProductCode(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
                  placeholder="np. INTERNET_300"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Opłata aktywacyjna (PLN)</div>
                <div className="text-[11px] text-muted-foreground">
                  Aktualnie: <span className="tabular-nums">{originalActivationFeeRef.current.toFixed(2)}</span> PLN
                </div>
                <input
                  value={activationFee}
                  onChange={(e) => setActivationFee(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm tabular-nums"
                  inputMode="decimal"
                  placeholder="np. 1"
                />
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Sprzedaż od</div>
                <input
                  type="date"
                  value={saleFrom}
                  onChange={(e) => setSaleFrom(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Sprzedaż do (opcjonalnie)</div>
                <input
                  type="date"
                  value={saleTo}
                  onChange={(e) => setSaleTo(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
            </div>

            <MonthPriceGrid monthPrices={monthPrices} setMonthPrices={setMonthPrices} />

            {isPrimary && (
              <div className="rounded-xl border p-3 bg-muted/10 space-y-3">
                <div className="text-sm font-medium">Po zakończeniu umowy na czas określony</div>
                <div className="text-xs text-muted-foreground">
                  Po upływie zobowiązania usługa przechodzi na czas nieokreślony. Podwyżka jednorazowa zadziała raz, a
                  cykliczna (jeśli włączona) będzie pamiętała o wzroście co 12 miesięcy.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Podwyżka po okresie zobowiązania (jednorazowa, PLN)</div>
                    <input
                      value={postTermIncreaseAmount}
                      onChange={(e) => setPostTermIncreaseAmount(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm tabular-nums"
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={isCyclic} onChange={(e) => setIsCyclic(e.target.checked)} />
                      Cykliczny wzrost cen (co 12 miesięcy po zakończonej umowie)
                    </label>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground">Wartości na czas nieokreślony (do liczenia ulgi)</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Aktywacja (PLN)</div>
                        <input
                          value={indefiniteActivationFee}
                          onChange={(e) => setIndefiniteActivationFee(e.target.value)}
                          className="mt-1 w-full rounded-md border px-3 py-2 text-sm tabular-nums"
                          inputMode="decimal"
                          placeholder="np. 199"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Abonament (PLN / mc)</div>
                        <input
                          value={indefiniteMonthlyPrice}
                          onChange={(e) => setIndefiniteMonthlyPrice(e.target.value)}
                          className="mt-1 w-full rounded-md border px-3 py-2 text-sm tabular-nums"
                          inputMode="decimal"
                          placeholder="np. 79"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {termMonths === null && (
                  <div className="text-xs text-muted-foreground">
                    Uwaga: plan bezterminowy nie ma "końca zobowiązania" — podwyżki po okresie zobowiązania nie będą miały
                    sensu operacyjnego.
                  </div>
                )}
              </div>
            )}

            {isPrimary && (
              <div className="rounded-xl border p-3 bg-muted/10 space-y-3">
                <div className="text-sm font-medium">QoS / kolejki na routerze</div>
                <div className="text-xs text-muted-foreground">
                  Nie zawsze potrzebne — możesz włączyć limit pobierania i/lub wysyłania niezależnie. Wpisuj w bit/s
                  (np. 300 Mb/s = 300000000).
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-background p-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={downloadLimitEnabled}
                        onChange={(e) => setDownloadLimitEnabled(e.target.checked)}
                      />
                      Pobieranie (DL)
                    </label>
                    <input
                      value={downloadBps}
                      onChange={(e) => setDownloadBps(e.target.value)}
                      disabled={!downloadLimitEnabled}
                      className="mt-2 w-full rounded-md border px-3 py-2 text-sm font-mono disabled:opacity-60"
                      placeholder="np. 300000000"
                      inputMode="numeric"
                    />
                    {!downloadLimitEnabled && (
                      <div className="mt-1 text-[11px] text-muted-foreground">Wyłączone — system nie tworzy kolejki DL.</div>
                    )}
                  </div>

                  <div className="rounded-lg border bg-background p-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={uploadLimitEnabled}
                        onChange={(e) => setUploadLimitEnabled(e.target.checked)}
                      />
                      Wysyłanie (UL)
                    </label>
                    <input
                      value={uploadBps}
                      onChange={(e) => setUploadBps(e.target.value)}
                      disabled={!uploadLimitEnabled}
                      className="mt-2 w-full rounded-md border px-3 py-2 text-sm font-mono disabled:opacity-60"
                      placeholder="np. 50000000"
                      inputMode="numeric"
                    />
                    {!uploadLimitEnabled && (
                      <div className="mt-1 text-[11px] text-muted-foreground">Wyłączone — system nie tworzy kolejki UL.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!isPrimary && (
              <div className="rounded-xl border p-3 bg-muted/10 space-y-2">
                <div className="text-sm font-medium">Addon → Magazyn</div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={requiresDevice} onChange={(e) => setRequiresDevice(e.target.checked)} />
                  Wymaga urządzenia (z magazynu)
                </label>
                <div>
                  <div className="text-xs text-muted-foreground">Dozwolone kategorie urządzeń (np. ONT, STB)</div>
                  <input
                    value={allowedDeviceCategories}
                    onChange={(e) => setAllowedDeviceCategories(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="np. ONT, STB"
                    disabled={!requiresDevice}
                  />
                </div>
              </div>
            )}

            {isPrimary && (
              <div className="rounded-xl border p-3 bg-muted/10 space-y-3">
                <div className="text-sm font-medium">Zależności: primary → addony</div>
                <div className="text-xs text-muted-foreground">
                  Tu definiujesz, jakie addony są powiązane z tą usługą główną (żeby handlowiec nie widział "losowych" addonów).
                  Wymagane będą zawsze dołączane do oferty i nie będzie dało się ich wyłączyć przy aktywnej usłudze głównej.
                </div>

                <div className="space-y-2">
                  {addonPlans.map((a) => {
                    const mode = depModeByAddonId[a.id] ?? "none";
                    return (
                      <div key={a.id} className="flex flex-wrap items-center gap-2 border rounded-lg px-3 py-2 bg-background">
                        <div className="min-w-[220px]">
                          <div className="text-sm font-medium">{a.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{a.billingProductCode}</div>
                        </div>

                        <select
                          value={mode}
                          onChange={(e) => {
                            const v = e.target.value as DepMode;
                            setDepModeByAddonId((prev) => ({ ...prev, [a.id]: v }));
                          }}
                          className="rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="none">Niepowiązany</option>
                          <option value="optional">Dobrowolny</option>
                          <option value="required">Wymagany</option>
                        </select>

                        <div className="ml-auto text-xs text-muted-foreground">
                          M1: {a.monthPrices?.[0]?.toFixed(2)} zł
                        </div>
                      </div>
                    );
                  })}

                  {addonPlans.length === 0 && <div className="text-sm text-muted-foreground">Brak addonów w systemie.</div>}
                </div>
              </div>
            )}

            <div className="rounded-xl border p-3 bg-muted/20">
              <div className="text-sm font-medium">Harmonogram zmian</div>
              <div className="text-xs text-muted-foreground mt-1">
                Po kliknięciu "Zapisz" wybierzesz: natychmiast vs zaplanuj. W backendzie to będzie change_request + audyt.
              </div>
            </div>
          </div>
        )}
      </SimpleModal>

      <EffectiveAtModal
        open={effectiveOpen}
        title={mode === "new" ? "Dodanie usługi" : "Edycja usługi"}
        description="Wybierz kiedy zmiana ma obowiązywać."
        confirmLabel={mode === "new" ? "Dodaj" : "Zaplanuj zmianę"}
        onClose={() => setEffectiveOpen(false)}
        onConfirm={(decision) => {
          setEffectiveOpen(false);

          const mp = monthPrices.map((v) => toNumberOrNaN(v));

          const req: string[] = [];
          const opt: string[] = [];
          for (const [addonId, m] of Object.entries(depModeByAddonId)) {
            if (m === "required") req.push(addonId);
            else if (m === "optional") opt.push(addonId);
          }

          const deviceCats = allowedDeviceCategories
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          const patch: Partial<ServicePlan> = {
            name: name.trim(),
            familyId,
            termId,
            billingProductCode: billingProductCode.trim(),
            activationFee: toNumberOrNaN(activationFee),

            indefiniteMonthlyPrice: toNumberOrNaN(indefiniteMonthlyPrice),
            indefiniteActivationFee: toNumberOrNaN(indefiniteActivationFee),

            saleFrom,
            saleTo: saleTo.trim() ? saleTo : null,

            monthPrices: mp,
            postTermIncreaseAmount: toNumberOrNaN(postTermIncreaseAmount),
            isCyclic,

            requiredAddonPlanIds: req,
            optionalAddonPlanIds: opt,
          };

          if (isPrimary) {
            patch.downloadBps = downloadLimitEnabled ? toNumberOrNaN(downloadBps) : undefined;
            patch.uploadBps = uploadLimitEnabled ? toNumberOrNaN(uploadBps) : undefined;
          }

          if (plan?.type === "addon") {
            patch.requiresDevice = requiresDevice;
            patch.allowedDeviceCategories = requiresDevice ? deviceCats : [];
          }

          onSave({ decision, planPatch: patch });
        }}
      />
    </>
  );
}