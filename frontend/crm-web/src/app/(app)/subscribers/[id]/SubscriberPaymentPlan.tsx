"use client";

import { useMemo, useState } from "react";

import type { SubscriberRecord } from "@/lib/mockSubscribers";

type PaymentPlanStatus = "planned" | "invoiced" | "adjustment_pending";

type PaymentPlanLine = {
  id: string;
  serviceKey: string;
  serviceTitle: string;
  title: string;
  quantity: number;
  netAmount: number;
  vatRate: number;
  grossAmount: number;
};

type PaymentPlanEntry = {
  id: string;
  periodLabel: string;
  dueDate: string;
  sourceType: "recurring" | "activation" | "adjustment";
  status: PaymentPlanStatus;
  invoiceNo?: string;
  invoiceIssuedAt?: string;
  versionNo: number;
  lines: PaymentPlanLine[];
};

type ServiceSeed = {
  serviceKey: string;
  serviceTitle: string;
  monthlyNet: number;
  vatRate: number;
  quantity?: number;
};

type PaymentPlanModel = {
  horizonLabel: string;
  contractTypeLabel: string;
  planVersion: number;
  lastRegeneratedAt: string;
  services: ServiceSeed[];
  entries: PaymentPlanEntry[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function addMonths(base: Date, offset: number) {
  const result = new Date(base);
  result.setMonth(result.getMonth() + offset);
  return result;
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function monthLabel(value: Date) {
  return new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function computeGross(netAmount: number, vatRate: number) {
  return Number((netAmount * (1 + vatRate)).toFixed(2));
}

function statusClass(status: PaymentPlanStatus) {
  switch (status) {
    case "planned":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "invoiced":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "adjustment_pending":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    default:
      return "border-border bg-muted/40 text-foreground";
  }
}

function statusLabel(status: PaymentPlanStatus) {
  switch (status) {
    case "planned":
      return "Do wystawienia";
    case "invoiced":
      return "Wystawione";
    case "adjustment_pending":
      return "Do przeliczenia";
    default:
      return status;
  }
}

function getSeedServices(subscriber: SubscriberRecord): { contractTypeLabel: string; horizonMonths: number; services: ServiceSeed[] } {
  switch (subscriber.id) {
    case "sub_0001":
      return {
        contractTypeLabel: "Umowa na czas określony · 24 miesiące",
        horizonMonths: 24,
        services: [
          { serviceKey: "internet", serviceTitle: "Internet FTTH 600/100", monthlyNet: 79, vatRate: 0.23 },
          { serviceKey: "public-ip", serviceTitle: "Publiczny adres IPv4", monthlyNet: 15, vatRate: 0.23 },
        ],
      };
    case "sub_0002":
      return {
        contractTypeLabel: "Umowa na czas nieokreślony · horyzont 12 miesięcy",
        horizonMonths: 12,
        services: [
          { serviceKey: "internet", serviceTitle: "Internet Biznes 1000/300", monthlyNet: 129, vatRate: 0.23 },
          { serviceKey: "public-ip", serviceTitle: "2 × publiczny adres IPv4", monthlyNet: 30, vatRate: 0.23, quantity: 2 },
          { serviceKey: "tv", serviceTitle: "Pakiet TV Start", monthlyNet: 25, vatRate: 0.23 },
        ],
      };
    default:
      return {
        contractTypeLabel: "Umowa na czas określony · 36 miesięcy",
        horizonMonths: 36,
        services: [
          { serviceKey: "internet", serviceTitle: "Internet Biznes Pro 2000/600", monthlyNet: 199, vatRate: 0.23 },
          { serviceKey: "voice", serviceTitle: "Telefonia SIP", monthlyNet: 25, vatRate: 0.23 },
          { serviceKey: "public-ip", serviceTitle: "Publiczny adres IPv4 /29", monthlyNet: 39, vatRate: 0.23 },
        ],
      };
  }
}

function buildPaymentPlan(subscriber: SubscriberRecord, versionNo: number): PaymentPlanModel {
  const seed = getSeedServices(subscriber);
  const start = new Date("2026-04-01T00:00:00");
  const entries: PaymentPlanEntry[] = [];

  const activationDate = new Date("2026-04-15T00:00:00");
  entries.push({
    id: `${subscriber.id}-activation-v${versionNo}`,
    periodLabel: "Aktywacja",
    dueDate: toIsoDate(activationDate),
    sourceType: "activation",
    status: "planned",
    versionNo,
    lines: [
      {
        id: `${subscriber.id}-activation-line-v${versionNo}`,
        serviceKey: "activation-fee",
        serviceTitle: "Opłata aktywacyjna",
        title: "Opłata aktywacyjna FTTH",
        quantity: 1,
        netAmount: 49,
        vatRate: 0.23,
        grossAmount: computeGross(49, 0.23),
      },
    ],
  });

  for (let index = 0; index < seed.horizonMonths; index += 1) {
    const period = addMonths(start, index);
    const invoiceNo = index < 2 ? `FV/2026/${String(index + 4).padStart(2, "0")}/${subscriber.id.replace("sub_", "")}` : undefined;
    const status: PaymentPlanStatus = index < 2 ? "invoiced" : index === 2 ? "adjustment_pending" : "planned";

    const lines = seed.services.map((service) => ({
      id: `${subscriber.id}-${service.serviceKey}-${index + 1}-v${versionNo}`,
      serviceKey: service.serviceKey,
      serviceTitle: service.serviceTitle,
      title: `${service.serviceTitle} · ${monthLabel(period)}`,
      quantity: service.quantity ?? 1,
      netAmount: service.monthlyNet,
      vatRate: service.vatRate,
      grossAmount: computeGross(service.monthlyNet, service.vatRate),
    }));

    entries.push({
      id: `${subscriber.id}-period-${index + 1}-v${versionNo}`,
      periodLabel: monthLabel(period),
      dueDate: toIsoDate(new Date(period.getFullYear(), period.getMonth(), 15)),
      sourceType: "recurring",
      status,
      invoiceNo,
      invoiceIssuedAt: invoiceNo ? toIsoDate(new Date(period.getFullYear(), period.getMonth(), 15)) : undefined,
      versionNo,
      lines,
    });
  }

  return {
    horizonLabel: seed.horizonMonths === 12 ? "Kolejne 12 miesięcy" : `${seed.horizonMonths} miesięcy obowiązywania umowy`,
    contractTypeLabel: seed.contractTypeLabel,
    planVersion: versionNo,
    lastRegeneratedAt: versionNo > 1 ? "2026-06-02T08:45:00" : "2026-04-01T09:10:00",
    services: seed.services,
    entries,
  };
}

function totalNet(lines: PaymentPlanLine[]) {
  return Number(lines.reduce((sum, line) => sum + line.netAmount, 0).toFixed(2));
}

function totalGross(lines: PaymentPlanLine[]) {
  return Number(lines.reduce((sum, line) => sum + line.grossAmount, 0).toFixed(2));
}

function totalVat(lines: PaymentPlanLine[]) {
  return Number((totalGross(lines) - totalNet(lines)).toFixed(2));
}

function SummaryCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {note && <div className="mt-2 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

export function SubscriberPaymentPlan({ subscriber }: { subscriber: SubscriberRecord }) {
  const [versionNo, setVersionNo] = useState(1);
  const model = useMemo(() => buildPaymentPlan(subscriber, versionNo), [subscriber, versionNo]);
  const [selectedEntryId, setSelectedEntryId] = useState<string>(() => model.entries[0]?.id ?? "");

  const selectedEntry = useMemo(() => {
    return model.entries.find((entry) => entry.id === selectedEntryId) ?? model.entries[0];
  }, [model.entries, selectedEntryId]);

  const nextPlanned = model.entries.find((entry) => entry.status !== "invoiced");
  const invoicedCount = model.entries.filter((entry) => entry.status === "invoiced").length;
  const plannedCount = model.entries.filter((entry) => entry.status === "planned").length;
  const pendingCount = model.entries.filter((entry) => entry.status === "adjustment_pending").length;
  const futureGross = model.entries
    .filter((entry) => entry.status !== "invoiced")
    .reduce((sum, entry) => sum + totalGross(entry.lines), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Kontrakt / horyzont" value={model.horizonLabel} note={model.contractTypeLabel} />
        <SummaryCard
          label="Następna kwota do wystawienia"
          value={nextPlanned ? formatMoney(totalGross(nextPlanned.lines)) : "—"}
          note={nextPlanned ? `${nextPlanned.periodLabel} · termin ${formatDate(nextPlanned.dueDate)}` : "Brak pozycji do wystawienia"}
        />
        <SummaryCard
          label="Status planu"
          value={`v${model.planVersion}`}
          note={`Ostatnia regeneracja: ${formatDateTime(model.lastRegeneratedAt)}`}
        />
        <SummaryCard
          label="Wartość przyszłych pozycji"
          value={formatMoney(futureGross)}
          note={`Do wystawienia: ${plannedCount} · do przeliczenia: ${pendingCount} · wystawione: ${invoicedCount}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(380px,0.9fr)]">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Plan płatności abonenta</div>
              <div className="mt-1 text-xs text-muted-foreground">
                UI-only: system ma tu liczyć przyszłe pozycje do faktury na podstawie aktywnych usług, ich tytułów, netto/VAT/brutto i statusu wystawienia.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setVersionNo((prev) => prev + 1)}
              className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
            >
              Regeneruj plan (mock)
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2">Okres</th>
                  <th className="px-3 py-2">Tytuł / pozycje</th>
                  <th className="px-3 py-2">Netto</th>
                  <th className="px-3 py-2">VAT</th>
                  <th className="px-3 py-2">Brutto</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Faktura</th>
                </tr>
              </thead>
              <tbody>
                {model.entries.map((entry) => {
                  const isSelected = selectedEntry?.id === entry.id;
                  return (
                    <tr
                      key={entry.id}
                      className={[
                        "border-b align-top transition",
                        isSelected ? "bg-muted/30" : "hover:bg-muted/20",
                      ].join(" ")}
                    >
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => setSelectedEntryId(entry.id)} className="text-left">
                          <div className="font-medium">{entry.periodLabel}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Termin: {formatDate(entry.dueDate)}</div>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{entry.lines.length} poz.</div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {entry.lines.map((line) => line.serviceTitle).join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-3">{formatMoney(totalNet(entry.lines))}</td>
                      <td className="px-3 py-3">{formatMoney(totalVat(entry.lines))}</td>
                      <td className="px-3 py-3 font-medium">{formatMoney(totalGross(entry.lines))}</td>
                      <td className="px-3 py-3">
                        <span className={["inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium", statusClass(entry.status)].join(" ")}>
                          {statusLabel(entry.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {entry.invoiceNo ? (
                          <div>
                            <div className="font-medium">{entry.invoiceNo}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{entry.invoiceIssuedAt ? formatDate(entry.invoiceIssuedAt) : "—"}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Jeszcze nie wystawiono</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-semibold">Pozycje źródłowe usług</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Każda aktywna usługa wnosi własny tytuł i kwotę do planu płatności. Zmieniasz usługę → system przelicza plan. Bez ręcznego sudoku w fakturach.
            </div>
            <div className="mt-4 space-y-3">
              {model.services.map((service) => (
                <div key={service.serviceKey} className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{service.serviceTitle}</div>
                      <div className="mt-1 text-xs text-muted-foreground">VAT {Math.round(service.vatRate * 100)}% · ilość {service.quantity ?? 1}</div>
                    </div>
                    <div className="text-sm font-semibold">{formatMoney(computeGross(service.monthlyNet, service.vatRate))}</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    netto {formatMoney(service.monthlyNet)} · brutto {formatMoney(computeGross(service.monthlyNet, service.vatRate))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-semibold">Podgląd wybranego okresu</div>
            <div className="mt-1 text-xs text-muted-foreground">
              To jest ten moment, w którym operator widzi dokładnie co ma wejść na fakturę. Zero archeologii po usługach i ręcznego klejenia tytułów.
            </div>

            {selectedEntry ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{selectedEntry.periodLabel}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Termin: {formatDate(selectedEntry.dueDate)}</div>
                    </div>
                    <span className={["inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium", statusClass(selectedEntry.status)].join(" ")}>
                      {statusLabel(selectedEntry.status)}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr className="border-b bg-muted/20">
                        <th className="px-3 py-2">Pozycja</th>
                        <th className="px-3 py-2">Netto</th>
                        <th className="px-3 py-2">VAT</th>
                        <th className="px-3 py-2">Brutto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntry.lines.map((line) => (
                        <tr key={line.id} className="border-b last:border-b-0">
                          <td className="px-3 py-3">
                            <div className="font-medium">{line.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{line.serviceTitle}</div>
                          </td>
                          <td className="px-3 py-3">{formatMoney(line.netAmount)}</td>
                          <td className="px-3 py-3">{formatMoney(line.grossAmount - line.netAmount)}</td>
                          <td className="px-3 py-3 font-medium">{formatMoney(line.grossAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/20 font-medium">
                        <td className="px-3 py-3">Suma</td>
                        <td className="px-3 py-3">{formatMoney(totalNet(selectedEntry.lines))}</td>
                        <td className="px-3 py-3">{formatMoney(totalVat(selectedEntry.lines))}</td>
                        <td className="px-3 py-3">{formatMoney(totalGross(selectedEntry.lines))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  Po kliknięciu „Wystaw fakturę” backend docelowo przenosi te pozycje do dokumentu sprzedaży, zapisuje numer faktury przy planie płatności i oznacza wpis jako wystawiony.
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Brak pozycji planu.</div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-semibold">Reguły biznesowe do spięcia później</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• usługa cykliczna generuje własne przyszłe wpisy planu płatności,</li>
              <li>• umowa na czas nieokreślony buduje rolling horizon na 12 miesięcy,</li>
              <li>• zmiana usługi lub ceny regeneruje tylko przyszłe pozycje i podbija wersję planu,</li>
              <li>• wystawiona faktura zapisuje numer dokumentu w historycznym wpisie planu,</li>
              <li>• pozycje powinny trzymać netto, VAT, brutto, tytuł i źródło usługi.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
