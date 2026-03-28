"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { SimpleModal } from "@/components/SimpleModal";
import { PrgAddressFinder, type PrgAddressPick } from "@/components/PrgAddressFinder";
import { ApiError, apiFetch } from "@/lib/api";
import { getIpamState, subscribeIpam } from "@/lib/mockIpam";

import { SubscriberPaymentPlan } from "./SubscriberPaymentPlan";
import { getStaffLabel, getTasksForSubscriber } from "@/lib/mockTasks";
import { useAuth } from "@/lib/auth";
import { formatKind, formatStatus, seedSubscribers, type SubscriberRecord } from "@/lib/mockSubscribers";
import {
  type DeviceCondition,
  getAvailableDevicesForSubscriberIssue,
  getDeviceAssignmentsForSubscriber,
  issueDeviceToSubscriber,
  prettyCondition,
  prettyKind,
  returnDeviceFromSubscriber,
  subscribeInventory,
  getInventoryState,
  getActiveOntsForSubscriber,
} from "@/lib/mockInventory";

type TabKey =
  | "dane"
  | "adresy"
  | "umowy"
  | "uslugi"
  | "plan_platnosci"
  | "rozliczenia"
  | "sprzet"
  | "ont"
  | "avios"
  | "zgody"
  | "historia"
  | "korespondencja"
  | "zadania";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "dane", label: "Dane" },
  { key: "adresy", label: "Adresy" },
  { key: "umowy", label: "Umowy" },
  { key: "uslugi", label: "Usługi" },
  { key: "plan_platnosci", label: "Plan płatności" },
  { key: "rozliczenia", label: "Rozliczenia" },
  { key: "sprzet", label: "Sprzęt" },
  { key: "ont", label: "ONT" },
  { key: "avios", label: "AVIOS" },
  { key: "zgody", label: "Zgody" },
  { key: "historia", label: "Historia" },
  { key: "korespondencja", label: "Korespondencja" },
  { key: "zadania", label: "Zadania" },
];

function Tabs({ value, onChange }: { value: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={[
            "rounded-full border px-3 py-1.5 text-sm transition",
            value === t.key ? "bg-muted/60" : "hover:bg-muted/40",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Card({ title, children, desc }: { title: string; desc?: string; children: React.ReactNode }) {
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

function KV({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0">
      <div className="text-sm text-muted-foreground">{k}</div>
      <div className="text-sm font-medium text-right break-words">{v ?? "—"}</div>
    </div>
  );
}

function YesNo(v?: boolean) {
  if (v === true) return "TAK";
  if (v === false) return "NIE";
  return "—";
}



type SubscriberSmsRow = {
  id: number;
  subscriber_id: number | null;
  status: string;
  queue_key: string;
  recipient_phone: string;
  sender_name: string | null;
  title: string | null;
  body: string;
  body_preview: string;
  provider: string;
  provider_message_id: string | null;
  provider_last_status: string | null;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string | null;
  created_by_staff_user_id: number | null;
  created_by_label: string | null;
};

type SendSubscriberSmsPayload = {
  title: string;
  recipient_phone: string;
  body: string;
  sender_name?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
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

function formatDateOnly(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusBadgeClass(status: string) {
  switch ((status || "").toLowerCase()) {
    case "queued":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300";
    case "sent":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "delivered":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "failed":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    default:
      return "border-border bg-muted/40 text-foreground";
  }
}

function parseSubscriberNumericId(subscriberId: string): number | null {
  const digits = subscriberId.replace(/\D+/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function SubscriberTasks({ s }: { s: SubscriberRecord }) {
  const rows = useMemo(() => getTasksForSubscriber(s.id), [s.id]);

  return (
    <Card
      title="Zadania powiązane z abonentem"
      desc="Tutaj pokazujemy tylko listę z modułu Zadania. Bez drugiego kalendarza w kartotece, bo duplikowanie bytów to szybka droga do cyfrowego bagna."
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">Źródło: mock modułu /tasks → zadania na abonencie</div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/tasks?source=subscriber-card&subscriberId=${s.id}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40">
            Dodaj zadanie dla tego abonenta
          </Link>
          <Link href="/tasks" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40">
            Otwórz moduł Zadania
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Brak zadań powiązanych z tym abonentem.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{row.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(row.startAt)} → {formatDateTime(row.endAt)}
                  </div>
                </div>
                <span className={["inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium", statusBadgeClass(row.status)].join(" ")}>
                  {row.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Pracownicy / zespoły</div>
                  <div className="mt-1 text-sm font-medium">{getStaffLabel(row.assignedStaffIds)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.assignedTeamNames.join(", ") || "—"}</div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Opis wykonania</div>
                  <div className="mt-1 text-sm">{row.completionNote || "Jeszcze niezamknięte / brak opisu wykonania."}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


function useInventorySnapshot() {
  return useSyncExternalStore(subscribeInventory, getInventoryState, getInventoryState);
}


function useIpamSnapshot() {
  return useSyncExternalStore(subscribeIpam, getIpamState, getIpamState);
}

function formatPrgAddressText(pick: PrgAddressPick | null | undefined, local?: string | null) {
  if (!pick) return "";
  const normalizedLocal = (local || "").trim();
  return [
    pick.place_name,
    `ul. ${pick.street_name}`,
    normalizedLocal ? `${pick.building_no}/${normalizedLocal}` : pick.building_no,
  ].filter(Boolean).join(", ");
}

function makeOntHttpLink(ip?: string) {
  return ip ? `http://${ip}` : "#";
}

function equipmentBadgeClass(kind: string) {
  if (kind === "SPRZEDANY") return "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300";
  if (kind === "WYPOZYCZENIE") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
  if (kind === "KLIENT") return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  if (kind === "MAGAZYN") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (kind === "SERWIS") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (kind === "WYSŁANY_NAPRAWA") return "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300";
  if (kind === "SPRAWNY") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (kind === "USZKODZONY" || kind === "DO_KASACJI") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (kind === "NIEKOMPLETNY") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted/40 text-foreground";
}

function EquipmentBadge({ value }: { value: string }) {
  return <span className={["inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium", equipmentBadgeClass(value)].join(" ")}>{value}</span>;
}

function getSubscriberDisplayName(s: SubscriberRecord) {
  return s.display_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || s.company_name || s.id;
}

function openSubscriberIssuePdf(args: {
  subscriber: SubscriberRecord;
  deviceKind: string;
  deviceModel: string;
  serialNo: string;
  mac?: string;
  ownership: "SPRZEDANY" | "WYPOZYCZENIE";
  issuedAtIso: string;
  issueReason?: string;
  issueAddressText?: string;
  issueAddressLocal?: string;
  managementIp?: string;
  managementNetworkCidr?: string;
}) {
  if (typeof window === "undefined") return;

  const issueType = args.ownership === "SPRZEDANY" ? "sprzedaż" : "wypożyczenie";
  const subscriberName = getSubscriberDisplayName(args.subscriber);
  const addressLine = [
    args.subscriber.addresses?.[0]?.street,
    args.subscriber.addresses?.[0]?.building_no,
    args.subscriber.addresses?.[0]?.apartment_no ? `/${args.subscriber.addresses?.[0]?.apartment_no}` : "",
  ].filter(Boolean).join(" ");
  const cityLine = [args.subscriber.addresses?.[0]?.postal_code, args.subscriber.addresses?.[0]?.city].filter(Boolean).join(" ");

  const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!popup) return;

  const html = `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>Protokół wydania sprzętu</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 28px; color: #111; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    h2 { font-size: 15px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #444; }
    .topbar { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
    .brand { font-size: 12px; color: #444; line-height: 1.5; }
    .docno { text-align: right; font-size: 12px; color: #444; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
    .box { border: 1px solid #cfcfcf; border-radius: 12px; padding: 14px; }
    .row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px solid #ececec; }
    .row:last-child { border-bottom: 0; }
    .label { font-size: 12px; color: #666; }
    .value { font-size: 14px; font-weight: 600; text-align: right; }
    .note { min-height: 88px; white-space: pre-wrap; }
    .footer { margin-top: 24px; font-size: 12px; color: #444; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 42px; }
    .sign { border-top: 1px solid #777; padding-top: 8px; font-size: 12px; color: #444; text-align: center; }
  </style>
</head>
<body>
  <div class="topbar">
    <div>
      <h1>Protokół wydania sprzętu</h1>
      <div class="brand">Gemini Internet sp. z o.o.<br />Dokument generowany z kartoteki abonenta</div>
    </div>
    <div class="docno">
      <div>Data dokumentu: <strong>${escapeHtml(formatDateOnly(args.issuedAtIso))}</strong></div>
      <div>Rodzaj wydania: <strong>${escapeHtml(issueType)}</strong></div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h2>Abonent</h2>
      <div class="row"><div class="label">Nazwa / imię i nazwisko</div><div class="value">${escapeHtml(subscriberName)}</div></div>
      <div class="row"><div class="label">Telefon</div><div class="value">${escapeHtml(args.subscriber.phone || "Brak")}</div></div>
      <div class="row"><div class="label">E-mail</div><div class="value">${escapeHtml(args.subscriber.email || "Brak")}</div></div>
      <div class="row"><div class="label">Adres</div><div class="value">${escapeHtml(addressLine || "Brak adresu")}</div></div>
      <div class="row"><div class="label">Miasto</div><div class="value">${escapeHtml(cityLine || "Brak")}</div></div>
    </div>
    <div class="box">
      <h2>Sprzęt</h2>
      <div class="row"><div class="label">Typ urządzenia</div><div class="value">${escapeHtml(args.deviceKind)}</div></div>
      <div class="row"><div class="label">Model</div><div class="value">${escapeHtml(args.deviceModel)}</div></div>
      <div class="row"><div class="label">Numer seryjny</div><div class="value">${escapeHtml(args.serialNo)}</div></div>
      <div class="row"><div class="label">MAC</div><div class="value">${escapeHtml(args.mac || "—")}</div></div>
      <div class="row"><div class="label">Tryb przekazania</div><div class="value">${escapeHtml(issueType)}</div></div>
      <div class="row"><div class="label">Adres wydania (PRG)</div><div class="value">${escapeHtml(args.issueAddressText || "—")}</div></div>
      <div class="row"><div class="label">Lokal</div><div class="value">${escapeHtml(args.issueAddressLocal || "—")}</div></div>
      <div class="row"><div class="label">Adres IP zarządzania</div><div class="value">${escapeHtml(args.managementIp || "—")}</div></div>
      <div class="row"><div class="label">Sieć zarządzania</div><div class="value">${escapeHtml(args.managementNetworkCidr || "—")}</div></div>
    </div>
  </div>

  <div class="box">
    <h2>Powód wydania</h2>
    <div class="note">${escapeHtml(args.issueReason?.trim() || "—")}</div>
  </div>

  <div class="footer">
    Dokument przygotowany do zapisu jako PDF z poziomu przeglądarki. W docelowym backendzie można nadać numer dokumentu, dodać operatora prowadzącego i podpis elektroniczny.
  </div>

  <div class="signatures">
    <div class="sign">Podpis osoby wydającej</div>
    <div class="sign">Podpis abonenta / odbierającego</div>
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

function openSubscriberReturnPdf(args: {
  subscriber: SubscriberRecord;
  deviceKind: string;
  deviceModel: string;
  serialNo: string;
  mac?: string;
  ownership: "SPRZEDANY" | "WYPOZYCZENIE";
  returnedAtIso: string;
  returnCondition: DeviceCondition;
  returnReason?: string;
  issueAddressText?: string;
  issueAddressLocal?: string;
  managementIp?: string;
  managementNetworkCidr?: string;
}) {
  if (typeof window === "undefined") return;

  const subscriberName = getSubscriberDisplayName(args.subscriber);
  const addressLine = [
    args.subscriber.addresses?.[0]?.street,
    args.subscriber.addresses?.[0]?.building_no,
    args.subscriber.addresses?.[0]?.apartment_no ? `/${args.subscriber.addresses?.[0]?.apartment_no}` : "",
  ].filter(Boolean).join(" ");
  const cityLine = [args.subscriber.addresses?.[0]?.postal_code, args.subscriber.addresses?.[0]?.city].filter(Boolean).join(" ");

  const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!popup) return;

  const html = `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>Protokół zwrotu sprzętu</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 28px; color: #111; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    h2 { font-size: 15px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #444; }
    .topbar { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
    .brand { font-size: 12px; color: #444; line-height: 1.5; }
    .docno { text-align: right; font-size: 12px; color: #444; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
    .box { border: 1px solid #cfcfcf; border-radius: 12px; padding: 14px; }
    .row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px solid #ececec; }
    .row:last-child { border-bottom: 0; }
    .label { font-size: 12px; color: #666; }
    .value { font-size: 14px; font-weight: 600; text-align: right; }
    .note { min-height: 88px; white-space: pre-wrap; }
    .footer { margin-top: 24px; font-size: 12px; color: #444; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 42px; }
    .sign { border-top: 1px solid #777; padding-top: 8px; font-size: 12px; color: #444; text-align: center; }
  </style>
</head>
<body>
  <div class="topbar">
    <div>
      <h1>Protokół zwrotu sprzętu</h1>
      <div class="brand">Gemini Internet sp. z o.o.<br />Dokument generowany z kartoteki abonenta</div>
    </div>
    <div class="docno">
      <div>Data dokumentu: <strong>${escapeHtml(formatDateOnly(args.returnedAtIso))}</strong></div>
      <div>Poprzedni tryb: <strong>${escapeHtml(args.ownership === "SPRZEDANY" ? "sprzedaż" : "wypożyczenie")}</strong></div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h2>Abonent</h2>
      <div class="row"><div class="label">Nazwa / imię i nazwisko</div><div class="value">${escapeHtml(subscriberName)}</div></div>
      <div class="row"><div class="label">Telefon</div><div class="value">${escapeHtml(args.subscriber.phone || "Brak")}</div></div>
      <div class="row"><div class="label">E-mail</div><div class="value">${escapeHtml(args.subscriber.email || "Brak")}</div></div>
      <div class="row"><div class="label">Adres</div><div class="value">${escapeHtml(addressLine || "Brak adresu")}</div></div>
      <div class="row"><div class="label">Miasto</div><div class="value">${escapeHtml(cityLine || "Brak")}</div></div>
    </div>
    <div class="box">
      <h2>Sprzęt</h2>
      <div class="row"><div class="label">Typ urządzenia</div><div class="value">${escapeHtml(args.deviceKind)}</div></div>
      <div class="row"><div class="label">Model</div><div class="value">${escapeHtml(args.deviceModel)}</div></div>
      <div class="row"><div class="label">Numer seryjny</div><div class="value">${escapeHtml(args.serialNo)}</div></div>
      <div class="row"><div class="label">MAC</div><div class="value">${escapeHtml(args.mac || "—")}</div></div>
      <div class="row"><div class="label">Stan przy zwrocie</div><div class="value">${escapeHtml(prettyCondition(args.returnCondition))}</div></div>
      <div class="row"><div class="label">Adres wydania (PRG)</div><div class="value">${escapeHtml(args.issueAddressText || "—")}</div></div>
      <div class="row"><div class="label">Lokal</div><div class="value">${escapeHtml(args.issueAddressLocal || "—")}</div></div>
      <div class="row"><div class="label">Adres IP zarządzania</div><div class="value">${escapeHtml(args.managementIp || "—")}</div></div>
      <div class="row"><div class="label">Sieć zarządzania</div><div class="value">${escapeHtml(args.managementNetworkCidr || "—")}</div></div>
    </div>
  </div>

  <div class="box">
    <h2>Powód zwrotu</h2>
    <div class="note">${escapeHtml(args.returnReason?.trim() || "—")}</div>
  </div>

  <div class="footer">
    Dokument przygotowany do zapisu jako PDF z poziomu przeglądarki. W docelowym backendzie można nadać numer dokumentu, dodać status weryfikacji technicznej i podpis elektroniczny.
  </div>

  <div class="signatures">
    <div class="sign">Podpis osoby przyjmującej</div>
    <div class="sign">Podpis abonenta / zwracającego</div>
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

function SubscriberOnt({ s }: { s: SubscriberRecord }) {
  const inventory = useInventorySnapshot();
  const onts = useMemo(() => getActiveOntsForSubscriber(s.id), [inventory, s.id]);

  if (onts.length === 0) {
    return (
      <Card
        title="ONT abonenta"
        desc="Zakładka pod provisioning i diagnostykę po wydaniu sprzętu. Tutaj ma być centrum dowodzenia ONT, a nie polowanie z latarką po notatkach instalatora."
      >
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Ten abonent nie ma aktywnie wydanego ONT. Najpierw wydaj urządzenie w zakładce Sprzęt.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        title="ONT abonenta"
        desc="Jeśli klient ma dwa ONT-y, to tutaj pokazujemy oba. Każdy z własnym adresem wydania, IP zarządzania i szybkim linkiem do panelu urządzenia — bez zgadywania, który klocek siedzi w którym lokalu."
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {onts.map((ont) => {
            const telemetry = ont.telemetry;

            return (
              <div key={ont.assignment.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{ont.device.model}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      SN: {ont.device.serialNo} • MAC: {ont.device.mac ?? "—"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <EquipmentBadge value={telemetry?.enabled ? "WŁĄCZONY" : "WYŁĄCZONY"} />
                    <EquipmentBadge value={ont.assignment.ownership} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Status urządzenia</div>
                    <div className="mt-2 text-xl font-semibold">
                      {telemetry?.enabled ? "Włączony" : "Wyłączony"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Ostatni odczyt: {formatDateTime(telemetry?.lastSeenAtIso)}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Aktualny profil</div>
                    <div className="mt-2 text-xl font-semibold">
                      {telemetry?.profileName ?? "Do konfiguracji"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Moc sygnału: {telemetry?.signalPowerDbm ?? "brak odczytu"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2 rounded-xl border p-3">
                  <KV k="Model" v={ont.device.model} />
                  <KV k="Numer seryjny" v={ont.device.serialNo} />
                  <KV k="MAC" v={ont.device.mac ?? "—"} />
                  <KV k="Tryb wydania" v={ont.assignment.ownership === "SPRZEDANY" ? "sprzedany" : "wypożyczenie"} />
                  <KV k="Wydano" v={formatDateTime(ont.assignment.issuedAtIso)} />
                  <KV k="Adres wydania" v={ont.assignment.issueAddressText ?? "—"} />
                  <KV k="Lokal" v={ont.assignment.issueAddressLocal ?? "—"} />
                  <KV k="IP zarządzania" v={ont.assignment.managementIp ?? "—"} />
                  <KV k="Sieć zarządzania" v={ont.assignment.managementNetworkCidr ?? "—"} />
                  <KV k="Ostatni powód wyłączenia" v={telemetry?.lastDisableReason ?? "Brak"} />
                </div>

                <div className="mt-4 rounded-xl border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Szybkie akcje</div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {ont.assignment.managementNetworkId ? (
                      <Link
                        href={`/config/ip/addresses?networkId=${encodeURIComponent(ont.assignment.managementNetworkId)}`}
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        Otwórz sieć zarządzania
                      </Link>
                    ) : null}

                    {ont.assignment.managementIp ? (
                      <a
                        href={makeOntHttpLink(ont.assignment.managementIp)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        Otwórz ONT: http://{ont.assignment.managementIp}
                      </a>
                    ) : (
                      <Link
                        href="/config/ip/addresses"
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        Dodaj adres IP zarządzania
                      </Link>
                    )}

                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                    >
                      Odśwież parametry
                    </button>

                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                    >
                      Zmień profil
                    </button>

                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                    >
                      Wyłącz ONT
                    </button>

                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                    >
                      Włącz ONT
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="Provisioning / diagnostyka"
        desc="UI mock pod przyszłe odczyty z GPON/OLT. Na razie pokazujemy docelowe pola, żeby backend wiedział, do czego ma dorosnąć bez freestyle’u."
      >
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Planowane akcje</div>
          <ul className="mt-2 space-y-2 text-sm">
            <li>• odczyt statusu ONT z OLT / ACS</li>
            <li>• ustawienie / zmiana profilu usługi</li>
            <li>• odczyt mocy sygnału i alarmów</li>
            <li>• zapis ostatniego powodu wyłączenia</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

function SubscriberEquipment({ s }: { s: SubscriberRecord }) {
  const inventory = useInventorySnapshot();
  const ipam = useIpamSnapshot();
  const [issueDeviceId, setIssueDeviceId] = useState("");
  const [issueOwnership, setIssueOwnership] = useState<"SPRZEDANY" | "WYPOZYCZENIE">("WYPOZYCZENIE");
  const [issueReason, setIssueReason] = useState("");
  const [issueAddressPick, setIssueAddressPick] = useState<PrgAddressPick | null>(null);
  const [issueAddressLocal, setIssueAddressLocal] = useState("");
  const [issueManagementAddressId, setIssueManagementAddressId] = useState("");
  const [returnReasonById, setReturnReasonById] = useState<Record<string, string>>({});
  const [returnConditionById, setReturnConditionById] = useState<Record<string, DeviceCondition>>({});
  const [confirmIssueOpen, setConfirmIssueOpen] = useState(false);
  const [confirmReturnDeviceId, setConfirmReturnDeviceId] = useState<string | null>(null);
  const [lastIssueDeviceId, setLastIssueDeviceId] = useState<string | null>(null);
  const [lastReturnDeviceId, setLastReturnDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const assignments = useMemo(() => getDeviceAssignmentsForSubscriber(s.id), [inventory, s.id]);
  const availableDevices = useMemo(() => getAvailableDevicesForSubscriberIssue(), [inventory]);
  const managementNetworks = useMemo(() => ipam.networks.filter((row) => row.poolKind === "INFRA"), [ipam]);
  const managementAddresses = useMemo(() => ipam.addresses.filter((row) => row.status === "FREE" && managementNetworks.some((net) => net.id === row.networkId)), [ipam, managementNetworks]);
  const selectedManagementAddress = useMemo(() => managementAddresses.find((row) => row.id === issueManagementAddressId) ?? null, [managementAddresses, issueManagementAddressId]);
  const selectedManagementNetwork = useMemo(() => managementNetworks.find((row) => row.id === selectedManagementAddress?.networkId) ?? null, [managementNetworks, selectedManagementAddress]);
  const activeAssignments = assignments.filter((row) => row.assignment.returnAtIso == null && row.device);
  const historyAssignments = assignments.filter((row) => row.assignment.returnAtIso != null && row.device);

  useEffect(() => {
    if (!issueDeviceId && availableDevices[0]) setIssueDeviceId(availableDevices[0].id);
  }, [availableDevices, issueDeviceId]);

  function handleIssue() {
    setError(null);
    setSuccess(null);
    try {
      if (!issueDeviceId) throw new Error("Wybierz urządzenie do wydania");
      if (!issueReason.trim()) throw new Error("Opis wydania nie może być pusty");
      if (!issueAddressPick) throw new Error("Wybierz adres wydania z wyszukiwarki PRG");
      issueDeviceToSubscriber({
        subscriberId: s.id,
        deviceId: issueDeviceId,
        ownership: issueOwnership,
        reason: issueReason,
        issueAddressText: formatPrgAddressText(issueAddressPick),
        issueAddressLocal,
        managementIpAddressId: issueManagementAddressId || undefined,
      });
      setLastIssueDeviceId(issueDeviceId);
      setSuccess("Sprzęt został wydany z magazynu na kartotece abonenta. Możesz od razu zapisać protokół jako PDF.");
      setIssueReason("");
      setIssueDeviceId("");
      setIssueAddressPick(null);
      setIssueAddressLocal("");
      setIssueManagementAddressId("");
      setConfirmIssueOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się wydać sprzętu.");
    }
  }

  function handleReturn(deviceId: string) {
    setError(null);
    setSuccess(null);
    try {
      const reason = (returnReasonById[deviceId] ?? "").trim();
      if (!reason) throw new Error("Opis zwrotu nie może być pusty");
      returnDeviceFromSubscriber({
        subscriberId: s.id,
        deviceId,
        condition: returnConditionById[deviceId] ?? "SPRAWNY",
        reason,
      });
      setLastReturnDeviceId(deviceId);
      setReturnReasonById((prev) => ({ ...prev, [deviceId]: "" }));
      setConfirmReturnDeviceId(null);
      setSuccess("Sprzęt został zwrócony na magazyn z określeniem stanu. Możesz od razu zapisać protokół zwrotu jako PDF.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zwrócić sprzętu.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card
          title="Sprzęt przypisany do abonenta"
          desc="Tu zamykamy obieg: wydanie do klienta i zwrot na magazyn dzieją się tylko z kartoteki abonenta. Magazyn ogarnia wyłącznie ruch wewnętrzny, żeby chaos nie levelował operatora."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Aktywne urządzenia</div>
              <div className="mt-2 text-2xl font-semibold">{activeAssignments.length}</div>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Wypożyczenia</div>
              <div className="mt-2 text-2xl font-semibold">{activeAssignments.filter((row) => row.assignment.ownership === "WYPOZYCZENIE").length}</div>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Sprzedane</div>
              <div className="mt-2 text-2xl font-semibold">{activeAssignments.filter((row) => row.assignment.ownership === "SPRZEDANY").length}</div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {activeAssignments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Brak aktywnie przypisanego sprzętu do tego abonenta.</div>
            ) : (
              activeAssignments.map(({ assignment, device }) => (
                <div key={assignment.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{device?.model ?? "Nieznane urządzenie"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{prettyKind(device?.kind ?? "INNY")} • SN: {device?.serialNo ?? "—"} • MAC: {device?.mac ?? "—"}</div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <EquipmentBadge value={assignment.ownership} />
                      <EquipmentBadge value={device?.status ?? "KLIENT"} />
                      <EquipmentBadge value={device?.condition ?? "SPRAWNY"} />
                      {device ? (
                        <button
                          type="button"
                          onClick={() =>
                            openSubscriberIssuePdf({
                              subscriber: s,
                              deviceKind: prettyKind(device.kind),
                              deviceModel: device.model,
                              serialNo: device.serialNo,
                              mac: device.mac,
                              ownership: assignment.ownership,
                              issuedAtIso: assignment.issuedAtIso,
                              issueReason: assignment.issueReason,
                              issueAddressText: assignment.issueAddressText,
                              issueAddressLocal: assignment.issueAddressLocal,
                              managementIp: assignment.managementIp,
                              managementNetworkCidr: assignment.managementNetworkCidr,
                            })
                          }
                          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/40"
                        >
                          Dokument wydania PDF
                        </button>
                      ) : null}
                      {assignment.returnAtIso && device ? (
                        <button
                          type="button"
                          onClick={() =>
                            openSubscriberReturnPdf({
                              subscriber: s,
                              deviceKind: prettyKind(device.kind),
                              deviceModel: device.model,
                              serialNo: device.serialNo,
                              mac: device.mac,
                              ownership: assignment.ownership,
                              returnedAtIso: assignment.returnAtIso!,
                              returnCondition: assignment.returnCondition ?? device.condition,
                              returnReason: assignment.returnReason,
                              issueAddressText: assignment.issueAddressText,
                              issueAddressLocal: assignment.issueAddressLocal,
                              managementIp: assignment.managementIp,
                              managementNetworkCidr: assignment.managementNetworkCidr,
                            })
                          }
                          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/40"
                        >
                          Dokument zwrotu PDF
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                      <div><span className="text-muted-foreground">Wydano:</span> {formatDateTime(assignment.issuedAtIso)}</div>
                      <div className="mt-1"><span className="text-muted-foreground">Tryb:</span> {assignment.ownership === "SPRZEDANY" ? "sprzedany" : "wypożyczenie"}</div>
                      <div className="mt-1"><span className="text-muted-foreground">Adres wydania:</span> {assignment.issueAddressText ?? "—"}</div>
                      <div className="mt-1"><span className="text-muted-foreground">Lokal:</span> {assignment.issueAddressLocal ?? "—"}</div>
                      <div className="mt-1"><span className="text-muted-foreground">IP zarządzania:</span> {assignment.managementIp ?? "—"}</div>
                      {assignment.managementIp ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link href={assignment.managementNetworkId ? `/config/ip/addresses?networkId=${encodeURIComponent(assignment.managementNetworkId)}` : "/config/ip/addresses"} className="rounded-md border px-2 py-1 text-xs hover:bg-muted/40">Sieć zarządzania</Link>
                          <a href={makeOntHttpLink(assignment.managementIp)} target="_blank" rel="noreferrer" className="rounded-md border px-2 py-1 text-xs hover:bg-muted/40">Otwórz ONT</a>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link href="/config/ip/addresses" className="rounded-md border px-2 py-1 text-xs hover:bg-muted/40">Dodaj adres IP zarządzania</Link>
                        </div>
                      )}
                      <div className="mt-1"><span className="text-muted-foreground">Powód:</span> {assignment.issueReason}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">Stan przy zwrocie</div>
                          <select
                            value={returnConditionById[device!.id] ?? "SPRAWNY"}
                            onChange={(event) => setReturnConditionById((prev) => ({ ...prev, [device!.id]: event.target.value as DeviceCondition }))}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          >
                            <option value="SPRAWNY">sprawny</option>
                            <option value="NIEKOMPLETNY">niekompletny</option>
                            <option value="USZKODZONY">uszkodzony</option>
                            <option value="DO_KASACJI">do kasacji</option>
                            <option value="ARCHIWUM">archiwum</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button type="button" onClick={() => setConfirmReturnDeviceId(device!.id)} className="w-full rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                            Zwrot na magazyn
                          </button>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">Opis zwrotu</div>
                        <textarea
                          rows={2}
                          value={returnReasonById[device!.id] ?? ""}
                          onChange={(event) => setReturnReasonById((prev) => ({ ...prev, [device!.id]: event.target.value }))}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          placeholder="Opisz powód zwrotu sprzętu"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card
          title="Wydanie sprzętu z magazynu"
          desc="Wybierasz konkretny egzemplarz po numerze seryjnym, określasz czy to sprzedaż czy wypożyczenie i karta klienta zostaje jedyną bramką do ruchu klientowego. Dzięki temu łatwiej złapać podmiany sprzętu i wiadomo, co realnie zeszło z magazynu."
        >
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Urządzenie dostępne w magazynie</div>
              <select value={issueDeviceId} onChange={(event) => setIssueDeviceId(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                {availableDevices.length === 0 ? <option value="">Brak dostępnych urządzeń</option> : null}
                {availableDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {prettyKind(device.kind)} • {device.model} • SN: {device.serialNo} • {prettyCondition(device.condition)}
                  </option>
                ))}
              </select>
              <div className="mt-2 rounded-lg border bg-muted/20 p-3 text-sm">
                <div><span className="text-muted-foreground">Wybrany model:</span> {availableDevices.find((device) => device.id === issueDeviceId)?.model ?? "—"}</div>
                <div className="mt-1"><span className="text-muted-foreground">Numer seryjny:</span> {availableDevices.find((device) => device.id === issueDeviceId)?.serialNo ?? "—"}</div>
                <div className="mt-1"><span className="text-muted-foreground">Stan:</span> {prettyCondition(availableDevices.find((device) => device.id === issueDeviceId)?.condition ?? "SPRAWNY")}</div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Tryb wydania</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setIssueOwnership("WYPOZYCZENIE")} className={["rounded-md border px-3 py-2 text-sm", issueOwnership === "WYPOZYCZENIE" ? "bg-muted/60" : "hover:bg-muted/40"].join(" ")}>
                  Wypożyczenie
                </button>
                <button type="button" onClick={() => setIssueOwnership("SPRZEDANY")} className={["rounded-md border px-3 py-2 text-sm", issueOwnership === "SPRZEDANY" ? "bg-muted/60" : "hover:bg-muted/40"].join(" ")}>
                  Sprzedany
                </button>
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <PrgAddressFinder
                title="Adres fizycznego wydania (PRG)"
                description={`Wybierz dokładny adres z PRG, żebyśmy wiedzieli, gdzie ten egzemplarz realnie trafił. Bez tego potem jest klasyczne: "ONT był gdzieś tu... chyba".`}
                onPick={setIssueAddressPick}
              />
              <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-sm">
                <div><span className="text-muted-foreground">Wybrany adres:</span> {formatPrgAddressText(issueAddressPick, issueAddressLocal) || "—"}</div>
                <div className="mt-1"><span className="text-muted-foreground">Lokal:</span> {issueAddressLocal.trim() || "—"}</div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Lokal (opcjonalnie)</div>
              <input
                value={issueAddressLocal}
                onChange={(event) => setIssueAddressLocal(event.target.value)}
                placeholder="Np. 12, A, 3B"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="mt-2 text-xs text-muted-foreground">Dla mieszkań i lokali usługowych. Zostaw puste, jeśli sprzęt trafia tylko do budynku.</div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Adres IP zarządzania (opcjonalnie)</div>
              <select value={issueManagementAddressId} onChange={(event) => setIssueManagementAddressId(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option value="">Bez przypisanego IP zarządzania</option>
                {managementAddresses.length === 0 ? <option value="" disabled>Brak wolnych adresów w sieci zarządzania</option> : null}
                {managementAddresses.map((address) => {
                  const network = managementNetworks.find((row) => row.id === address.networkId);
                  return (
                    <option key={address.id} value={address.id}>
                      {address.ip} • {network?.cidr ?? "brak sieci"} • {network?.description ?? "sieć zarządzania"}
                    </option>
                  );
                })}
              </select>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href="/config/ip/addresses" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">Otwórz magazyn IP</Link>
                {selectedManagementAddress?.ip ? (
                  <a href={makeOntHttpLink(selectedManagementAddress.ip)} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                    Test linku do urządzenia: http://{selectedManagementAddress.ip}
                  </a>
                ) : null}
              </div>
              <div className="mt-2 rounded-lg border bg-muted/20 p-3 text-sm">
                <div><span className="text-muted-foreground">Wybrany adres IP:</span> {selectedManagementAddress?.ip ?? "brak — można dodać później"}</div>
                <div className="mt-1"><span className="text-muted-foreground">Sieć:</span> {selectedManagementNetwork?.cidr ?? "—"}</div>
                <div className="mt-1"><span className="text-muted-foreground">Gateway:</span> {selectedManagementAddress?.gateway ?? "—"}</div>
                <div className="mt-1"><span className="text-muted-foreground">MAC urządzenia:</span> {availableDevices.find((device) => device.id === issueDeviceId)?.mac ?? "—"}</div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Adres IP zarządzania nie jest wymagany przy wydaniu. Jeśli dziś go nie znasz, dodasz go później z poziomu urządzenia.</div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Opis wydania</div>
              <textarea rows={3} value={issueReason} onChange={(event) => setIssueReason(event.target.value)} placeholder="Opisz powód wydania sprzętu" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <button type="button" onClick={() => setConfirmIssueOpen(true)} className="w-full rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
              Wydaj sprzęt do abonenta
            </button>

            {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</div> : null}
            {success ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{success}</div> : null}

            {lastIssueDeviceId ? (() => {
              const assignment = getDeviceAssignmentsForSubscriber(s.id).find((row) => row.device?.id === lastIssueDeviceId && !row.assignment.returnAtIso);
              if (!assignment?.device) return null;
              const device = assignment.device;
              return (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <div className="font-medium">Ostatnio wydany sprzęt</div>
                  <div className="mt-1 text-muted-foreground">{device.model} • SN: {device.serialNo}</div>
                  <button
                    type="button"
                    onClick={() =>
                      openSubscriberIssuePdf({
                        subscriber: s,
                        deviceKind: prettyKind(device.kind),
                        deviceModel: device.model,
                        serialNo: device.serialNo,
                        mac: device.mac,
                        ownership: assignment.assignment.ownership,
                        issuedAtIso: assignment.assignment.issuedAtIso,
                        issueReason: assignment.assignment.issueReason,
                        issueAddressText: assignment.assignment.issueAddressText,
                        issueAddressLocal: assignment.assignment.issueAddressLocal,
                        managementIp: assignment.assignment.managementIp,
                        managementNetworkCidr: assignment.assignment.managementNetworkCidr,
                      })
                    }
                    className="mt-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    Otwórz ostatni dokument wydania PDF
                  </button>
                </div>
              );
            })() : null}

            {lastReturnDeviceId ? (() => {
              const assignment = getDeviceAssignmentsForSubscriber(s.id).find((row) => row.device?.id === lastReturnDeviceId && !!row.assignment.returnAtIso);
              if (!assignment?.device || !assignment.assignment.returnAtIso) return null;
              const device = assignment.device;
              return (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <div className="font-medium">Ostatnio zwrócony sprzęt</div>
                  <div className="mt-1 text-muted-foreground">{device.model} • SN: {device.serialNo}</div>
                  <button
                    type="button"
                    onClick={() =>
                      openSubscriberReturnPdf({
                        subscriber: s,
                        deviceKind: prettyKind(device.kind),
                        deviceModel: device.model,
                        serialNo: device.serialNo,
                        mac: device.mac,
                        ownership: assignment.assignment.ownership,
                        returnedAtIso: assignment.assignment.returnAtIso!,
                        returnCondition: assignment.assignment.returnCondition ?? device.condition,
                        returnReason: assignment.assignment.returnReason,
                      })
                    }
                    className="mt-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    Otwórz ostatni dokument zwrotu PDF
                  </button>
                </div>
              );
            })() : null}

            <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              Magazyn zostaje miejscem tylko dla ruchu wewnętrznego: magazyn ↔ serwis ↔ wysłany naprawa.
              Ruch klientowy robimy tutaj, więc historia abonenta i sprzętu jest spójna i nie trzeba później robić cyfrowej archeologii.
            </div>
          </div>
        </Card>
      </div>

      <Card title="Historia sprzętu na abonencie" desc="Lista wszystkich wydań i zwrotów dla tej kartoteki. UI-only mock, ale flow już jest jak trzeba.">
        {historyAssignments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Brak zwróconych urządzeń w historii abonenta.</div>
        ) : (
          <div className="space-y-3">
            {historyAssignments.map(({ assignment, device }) => (
              <div key={assignment.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{device?.model ?? "Nieznane urządzenie"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{prettyKind(device?.kind ?? "INNY")} • SN: {device?.serialNo ?? "—"}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <EquipmentBadge value={assignment.ownership} />
                    <EquipmentBadge value={assignment.returnCondition ?? device?.condition ?? "SPRAWNY"} />
                    {assignment.returnAtIso && device ? (
                      <button
                        type="button"
                        onClick={() =>
                          openSubscriberReturnPdf({
                            subscriber: s,
                            deviceKind: prettyKind(device.kind),
                            deviceModel: device.model,
                            serialNo: device.serialNo,
                            mac: device.mac,
                            ownership: assignment.ownership,
                            returnedAtIso: assignment.returnAtIso!,
                            returnCondition: assignment.returnCondition ?? device.condition,
                            returnReason: assignment.returnReason,
                          })
                        }
                        className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/40"
                      >
                        Dokument zwrotu PDF
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                    <div><span className="text-muted-foreground">Wydano:</span> {formatDateTime(assignment.issuedAtIso)}</div>
                    <div className="mt-1"><span className="text-muted-foreground">Opis wydania:</span> {assignment.issueReason}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                    <div><span className="text-muted-foreground">Zwrot:</span> {formatDateTime(assignment.returnAtIso)}</div>
                    <div className="mt-1"><span className="text-muted-foreground">Stan przy zwrocie:</span> {assignment.returnCondition ? prettyCondition(assignment.returnCondition) : "—"}</div>
                    <div className="mt-1"><span className="text-muted-foreground">Opis zwrotu:</span> {assignment.returnReason ?? "—"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SimpleModal
        open={confirmIssueOpen}
        onClose={() => setConfirmIssueOpen(false)}
        title="Potwierdzenie wydania sprzętu"
        description={`Jesteś pewien, że chcesz wydać sprzęt na rzecz klienta ${getSubscriberDisplayName(s)}?`}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setConfirmIssueOpen(false)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">Anuluj</button>
            <button type="button" onClick={handleIssue} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">Potwierdź wydanie</button>
          </div>
        }
      >
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <div><span className="text-muted-foreground">Abonent:</span> {getSubscriberDisplayName(s)}</div>
          <div className="mt-1"><span className="text-muted-foreground">Sprzęt:</span> {availableDevices.find((device) => device.id === issueDeviceId)?.model ?? "—"}</div>
          <div className="mt-1"><span className="text-muted-foreground">Numer seryjny:</span> {availableDevices.find((device) => device.id === issueDeviceId)?.serialNo ?? "—"}</div>
          <div className="mt-1"><span className="text-muted-foreground">Tryb:</span> {issueOwnership === "SPRZEDANY" ? "sprzedany" : "wypożyczenie"}</div>
          <div className="mt-1"><span className="text-muted-foreground">Adres wydania:</span> {formatPrgAddressText(issueAddressPick, issueAddressLocal) || "—"}</div>
          <div className="mt-1"><span className="text-muted-foreground">Lokal:</span> {issueAddressLocal.trim() || "—"}</div>
          <div className="mt-1"><span className="text-muted-foreground">Adres IP zarządzania:</span> {selectedManagementAddress?.ip ?? "brak — dodasz później"}</div>
        </div>
        {!issueReason.trim() ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            Opis wydania nie może być pusty. Dzięki temu nie wyślemy w obieg domyślnej papki.
          </div>
        ) : null}
      </SimpleModal>

      <SimpleModal
        open={confirmReturnDeviceId != null}
        onClose={() => setConfirmReturnDeviceId(null)}
        title="Potwierdzenie zwrotu sprzętu"
        description={`Jesteś pewien, że chcesz przyjąć zwrot sprzętu od klienta ${getSubscriberDisplayName(s)}?`}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setConfirmReturnDeviceId(null)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">Anuluj</button>
            <button type="button" onClick={() => confirmReturnDeviceId && handleReturn(confirmReturnDeviceId)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">Potwierdź zwrot</button>
          </div>
        }
      >
        {(() => {
          const device = activeAssignments.find((row) => row.device?.id === confirmReturnDeviceId)?.device;
          return (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <div><span className="text-muted-foreground">Abonent:</span> {getSubscriberDisplayName(s)}</div>
                <div className="mt-1"><span className="text-muted-foreground">Sprzęt:</span> {device?.model ?? "—"}</div>
                <div className="mt-1"><span className="text-muted-foreground">Numer seryjny:</span> {device?.serialNo ?? "—"}</div>
                <div className="mt-1"><span className="text-muted-foreground">Stan po zwrocie:</span> {prettyCondition(returnConditionById[confirmReturnDeviceId ?? ""] ?? "SPRAWNY")}</div>
              </div>
              {!((returnReasonById[confirmReturnDeviceId ?? ""] ?? "").trim()) ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  Opis zwrotu nie może być pusty. Bez tego papierologia znowu zrobi salto.
                </div>
              ) : null}
            </div>
          );
        })()}
      </SimpleModal>
    </div>
  );
}

function CorrespondenceSms({ s }: { s: SubscriberRecord }) {
  const { token, logout } = useAuth();
  const subscriberNumericId = useMemo(() => parseSubscriberNumericId(s.id), [s.id]);
  const [rows, setRows] = useState<SubscriberSmsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<SendSubscriberSmsPayload>({
    title: "",
    recipient_phone: s.phone ?? "",
    body: "",
    sender_name: "",
  });

  async function loadMessages() {
    if (!token || subscriberNumericId == null) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SubscriberSmsRow[]>(`/sms/subscribers/${subscriberNumericId}/messages?limit=100`, {
        method: "GET",
        token,
        onUnauthorized: () => logout(),
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Nie udało się pobrać historii SMS.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      recipient_phone: prev.recipient_phone || s.phone || "",
    }));
  }, [s.phone]);

  useEffect(() => {
    loadMessages();
  }, [token, subscriberNumericId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || subscriberNumericId == null) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch<{ message: { id: number } }>(`/sms/subscribers/${subscriberNumericId}/send`, {
        method: "POST",
        token,
        onUnauthorized: () => logout(),
        body: {
          title: form.title.trim(),
          recipient_phone: form.recipient_phone.trim(),
          body: form.body.trim(),
          sender_name: form.sender_name?.trim() || null,
        },
      });
      setSuccess("SMS dodany do kolejki.");
      setForm((prev) => ({ ...prev, title: "", body: "" }));
      await loadMessages();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Nie udało się wysłać SMS.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (subscriberNumericId == null) {
    return (
      <Card
        title="Korespondencja → SMS"
        desc="Mockowe ID abonenta nie daje się zmapować na numeric subscriber_id dla API. To jest ten klasyczny chochlik integracyjny."
      >
        <div className="text-sm text-muted-foreground">Brak numeric subscriber_id dla tego rekordu UI.</div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-4">
      <Card
        title="Wyślij SMS"
        desc="Thin UI nad kanoniczną kolejką SMS. Tytuł zapisujemy w meta wiadomości, żeby karta abonenta miała ludzki kontekst zamiast cyfrowej kaszanki."
      >
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Field label="Tytuł">
            <TextInput value={form.title} onChange={(v) => setForm((prev) => ({ ...prev, title: v }))} placeholder="np. Przypomnienie o instalacji" />
          </Field>
          <Field label="Numer telefonu">
            <TextInput
              value={form.recipient_phone}
              onChange={(v) => setForm((prev) => ({ ...prev, recipient_phone: v }))}
              placeholder="np. +48 600 100 200"
            />
          </Field>
          <Field label="Nadawca (opcjonalnie)">
            <TextInput
              value={form.sender_name ?? ""}
              onChange={(v) => setForm((prev) => ({ ...prev, sender_name: v }))}
              placeholder="np. Gemini"
            />
          </Field>
          <Field label="Treść">
            <textarea
              value={form.body}
              onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              placeholder="Treść SMS…"
              rows={6}
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            />
          </Field>

          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</div>}
          {success && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{success}</div>}

          <button
            type="submit"
            disabled={submitting || !form.title.trim() || !form.recipient_phone.trim() || !form.body.trim()}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Kolejkowanie…" : "Wyślij do kolejki SMS"}
          </button>
        </form>
      </Card>

      <Card
        title="Historia SMS"
        desc="Widok per abonent: treść, tytuł, staff sender, numer, status i timestampy. Czyli dokładnie to, czego brakowało, żeby nie latać po systemie jak szalony chomik."
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">subscriber_id API: {subscriberNumericId}</div>
          <button
            type="button"
            onClick={() => loadMessages()}
            disabled={loading}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-50"
          >
            {loading ? "Odświeżanie…" : "Odśwież"}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {loading ? "Ładowanie historii…" : "Brak SMS dla tego abonenta."}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{row.title || "Bez tytułu"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.created_by_label || "System"} • {row.recipient_phone} • {row.sender_name || "domyślny sender"}
                    </div>
                  </div>
                  <span className={["inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium", statusBadgeClass(row.status)].join(" ")}>
                    {row.status}
                  </span>
                </div>

                <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-sm">{row.body}</div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-2">
                  <div>Utworzono: {formatDateTime(row.created_at)}</div>
                  <div>Zaplanowano: {formatDateTime(row.scheduled_at)}</div>
                  <div>Wysłano: {formatDateTime(row.sent_at)}</div>
                  <div>Dostarczono: {formatDateTime(row.delivered_at)}</div>
                  <div>Provider status: {row.provider_last_status || "—"}</div>
                  <div>Próby: {row.attempt_count} / {row.max_attempts}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SubscriberBasics({ s }: { s: SubscriberRecord }) {
  const isPerson = s.kind === "person";
  const isJdg = s.kind === "jdg";
  // Company-like legal forms in our UI taxonomy (see src/lib/mockSubscribers.ts)
  const isCompany =
    s.kind === "spolka_cywilna" ||
    s.kind === "spolka_osobowa" ||
    s.kind === "spolka_kapitalowa" ||
    s.kind === "fundacja" ||
    s.kind === "jednostka_budzetowa";

  // UI-only: firmy muszą mieć osobę/osoby upoważnione do reprezentacji.
  // Nie łamiemy kompatybilności: jeśli seed nie ma jeszcze tego pola, UI pokaże ostrzeżenie.
  const reps = (s as any).representatives as Array<{ first_name: string; last_name: string }> | undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card
        title="Usługobiorca"
        desc="Pola bazowe z excela (UI-only). Docelowo: walidacje + profil wersjonowany + audit."
      >
        <KV k="Rodzaj abonenta" v={formatKind(s.kind)} />
        <KV k="Status" v={formatStatus(s.status)} />

        {/* Nie pokazujemy zbędnych danych: obywatelstwo nie dotyczy spółek/jednostek */}
        {!isCompany && <KV k="Obywatelstwo" v={s.citizenship} />}

        {(isPerson || isJdg) && <KV k="Imię" v={s.first_name} />}
        {(isPerson || isJdg) && <KV k="Nazwisko" v={s.last_name} />}

        {(isJdg || isCompany) && <KV k="Nazwa" v={s.company_name ?? s.display_name} />}

        {/* Firmy/JDG: pokazujemy kluczowe identyfikatory */}
        {(isJdg || isCompany) && <KV k="NIP" v={s.nip} />}
        {(isJdg || isCompany) && <KV k="REGON" v={s.regon} />}
        {isCompany && <KV k="KRS" v={s.krs} />}
        {isJdg && <KV k="CEIDG" v={s.ceidg} />}

        {/* Reprezentanci: wymagane dla spółek/jednostek */}
        {isCompany && (
          <div className="mt-3 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">Osoby upoważnione do reprezentacji</div>
              <span
                className={[
                  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs",
                  !reps || reps.length === 0 ? "border-destructive/40 text-destructive" : "bg-muted/30",
                ].join(" ")}
              >
                {!reps || reps.length === 0 ? "BRAK (wymagane)" : `${reps.length} osoba/osób`}
              </span>
            </div>

            {!reps || reps.length === 0 ? (
              <div className="mt-2 text-sm">Dodaj co najmniej 1 reprezentanta (Imię + Nazwisko).</div>
            ) : (
              <ul className="mt-2 space-y-1">
                {reps.map((r, idx) => (
                  <li key={`${r.first_name}-${r.last_name}-${idx}`} className="text-sm">
                    {idx + 1}. {r.first_name} {r.last_name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {isPerson && <KV k="PESEL" v={s.pesel} />}
        {(isPerson || isJdg) && <KV k="Seria/nr dowodu" v={s.id_card_no} />}
        {(isPerson || isJdg) && <KV k="Seria/nr paszportu" v={s.passport_no} />}
        {(isPerson || isJdg) && <KV k="Dokument UE" v={s.eu_doc_no} />}
      </Card>

      <div className="space-y-3">
        <Card title="Kontakt">
          <KV k="Telefon" v={s.phone} />
          <KV k="E-mail" v={s.email} />
          <KV k="Utworzono" v={s.created_at} />
        </Card>

        <Card title="KYC / dokumenty" desc="W excelu: skan dokumentu KYC + historia zmian. Tu placeholder UI.">
          <KV k="Skan / referencja" v={s.kyc_doc_ref} />
          <KV k="KYC kompletne" v={YesNo(Boolean(s.kyc_doc_ref))} />
          <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            Docelowo: upload + podgląd, wersjonowanie danych, i pełny audit (kto/kiedy/co/skąd/przed/po).
          </div>
        </Card>
      </div>
    </div>
  );
}

/* =========================
   ADRESY – poprawiona logika
   ========================= */

type AddressKey =
  | "zamieszkania"
  | "zameldowania"
  | "siedziba_firmy"
  | "korespondencyjny"
  | "fakturowy"
  | "platnika";

type UiAddress = {
  label: AddressKey;
  note?: string;

  country: string;
  city: string;
  postal_code: string;
  street: string;
  building_no: string;
  apartment_no: string;

  // PRG/TERYT
  terc?: string;
  simc?: string;
  ulic?: string;

  // UI-only: “pierwsza linia” dla płatnika, gdy NIE jest identyczny z adresem głównym
  payer_name?: string;
};

function TextInput({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={[
        "w-full rounded-md border px-3 py-2 text-sm bg-background",
        disabled ? "opacity-70 cursor-not-allowed" : "",
      ].join(" ")}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

function Addresses({ s }: { s: SubscriberRecord }) {
  const labelMap: Record<AddressKey, string> = {
    siedziba_firmy: "Siedziba firmy",
    zameldowania: "Adres zameldowania",
    zamieszkania: "Adres zamieszkania",
    korespondencyjny: "Adres korespondencyjny",
    fakturowy: "Adres fakturowy",
    platnika: "Adres płatnika",
  };

  const isPerson = s.kind === "person";
  const isJdg = s.kind === "jdg";
  const isCompany =
    s.kind === "spolka_cywilna" ||
    s.kind === "spolka_osobowa" ||
    s.kind === "spolka_kapitalowa" ||
    s.kind === "fundacja" ||
    s.kind === "jednostka_budzetowa";

  // JDG traktujemy jak “firma” dla adresów (siedziba jako główny).
  const isBusiness = isJdg || isCompany;

  const visibleLabels: AddressKey[] = isBusiness
    ? ["siedziba_firmy", "korespondencyjny", "fakturowy", "platnika"]
    : ["zamieszkania", "zameldowania", "korespondencyjny", "fakturowy", "platnika"];

  const primaryLabel: AddressKey = isBusiness ? "siedziba_firmy" : "zamieszkania";
  const primaryCopyLabel = isBusiness ? "adres siedziby" : "adres zamieszkania";

  const initialAddresses = useMemo<UiAddress[]>(() => {
    const existing = new Map<AddressKey, any>();
    (s.addresses ?? []).forEach((a: any) => {
      existing.set(a.label as AddressKey, a);
    });

    return visibleLabels.map((lbl) => {
      const a = existing.get(lbl);
      return {
        label: lbl,
        note: a?.note,
        street: a?.street ?? "",
        building_no: a?.building_no ?? "",
        apartment_no: a?.apartment_no ?? "",
        postal_code: a?.postal_code ?? "",
        city: a?.city ?? "",
        country: a?.country ?? "PL",
        terc: a?.terc,
        simc: a?.simc,
        ulic: a?.ulic,
        payer_name: "",
      };
    });
  }, [s.addresses, visibleLabels]);

  const [addresses, setAddresses] = useState<UiAddress[]>(initialAddresses);

  const [prgOpenFor, setPrgOpenFor] = useState<AddressKey | null>(null);

  const applyPrgPick = (label: AddressKey, picked: PrgAddressPick) => {
    setAddresses((prev) =>
      prev.map((x) => {
        if (x.label !== label) return x;
        return {
          ...x,
          country: "PL",
          city: picked.place_name,
          street: picked.street_name,
          building_no: picked.building_no,
          terc: picked.terc,
          simc: picked.simc,
          ulic: picked.ulic,
        };
      })
    );
  };


  // checkboxy: które adresy są “identyczne jak główny”
  // - domyślnie: true
  // - ale jeśli seed ma już dane inne niż primary, to ustawiamy false (żeby nie “nadpisać” na starcie)
  const [sameAsPrimary, setSameAsPrimary] = useState<Record<AddressKey, boolean>>(() => {
    const map = {} as Record<AddressKey, boolean>;

    // init: wszystko poza primary = true
    visibleLabels.forEach((lbl) => {
      if (lbl === primaryLabel) return;
      map[lbl] = true;
    });

    // jeżeli w seedzie są różnice — checkbox off
    const src = new Map<AddressKey, any>();
    (s.addresses ?? []).forEach((a: any) => src.set(a.label as AddressKey, a));

    const p = src.get(primaryLabel);
    if (p) {
      visibleLabels.forEach((lbl) => {
        if (lbl === primaryLabel) return;
        const a = src.get(lbl);
        if (!a) return;

        const eq =
          (a.street ?? "") === (p.street ?? "") &&
          (a.building_no ?? "") === (p.building_no ?? "") &&
          (a.apartment_no ?? "") === (p.apartment_no ?? "") &&
          (a.postal_code ?? "") === (p.postal_code ?? "") &&
          (a.city ?? "") === (p.city ?? "") &&
          (a.country ?? "") === (p.country ?? "");

        if (!eq) map[lbl] = false;
      });
    }

    return map;
  });

  const primary = useMemo(() => addresses.find((a) => a.label === primaryLabel) ?? null, [addresses, primaryLabel]);

  const copyFromPrimary = (label: AddressKey) => {
    if (!primary) return;
    setAddresses((prev) =>
      prev.map((x) => {
        if (x.label !== label) return x;
        return {
          ...x,
          street: primary.street,
          building_no: primary.building_no,
          apartment_no: primary.apartment_no,
          postal_code: primary.postal_code,
          city: primary.city,
          country: primary.country,
          terc: primary.terc,
          simc: primary.simc,
          ulic: primary.ulic,
        };
      })
    );
  };

  // gdy primary się zmienia: aktualizujemy wszystkie, które są “sameAsPrimary”
  useEffect(() => {
    if (!primary) return;
    setAddresses((prev) =>
      prev.map((x) => {
        if (x.label === primaryLabel) return x;
        if (!sameAsPrimary[x.label]) return x;
        return {
          ...x,
          street: primary.street,
          building_no: primary.building_no,
          apartment_no: primary.apartment_no,
          postal_code: primary.postal_code,
          city: primary.city,
          country: primary.country,
          terc: primary.terc,
          simc: primary.simc,
          ulic: primary.ulic,
        };
      })
    );
  }, [
    primary?.street,
    primary?.building_no,
    primary?.apartment_no,
    primary?.postal_code,
    primary?.city,
    primary?.country,
    primary?.terc,
    primary?.simc,
    primary?.ulic,
    primaryLabel,
    sameAsPrimary,
    primary,
  ]);

  if (!addresses || addresses.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
        Brak adresów (placeholder)
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {addresses.map((a) => {
        const isPrimary = a.label === primaryLabel;
        const isLinked = !isPrimary && (sameAsPrimary[a.label] ?? true);

        return (
          <Card
            key={a.label}
            title={labelMap[a.label] ?? a.label}
            desc={a.note ?? (isPrimary ? "Adres główny" : undefined)}
          >
            {!isPrimary && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={sameAsPrimary[a.label] ?? true}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSameAsPrimary((prev) => ({ ...prev, [a.label]: checked }));
                    if (checked) {
                      copyFromPrimary(a.label);
                    }
                  }}
                />
                Identyczny jak {primaryCopyLabel}
              </label>
            )}

            {/* specjalny case: PŁATNIK, gdy NIE identyczny */}
            {a.label === "platnika" && !isPrimary && !isLinked && (
              <Field label="Nazwa płatnika (pierwsza linia)">
                <TextInput
                  value={a.payer_name}
                  onChange={(v) =>
                    setAddresses((prev) =>
                      prev.map((x) => (x.label === a.label ? { ...x, payer_name: v } : x))
                    )
                  }
                  placeholder="np. Jan Kowalski / ACME Sp. z o.o."
                />
              </Field>
            )}

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Kraj">
                  <input
                    className="w-full rounded-md border px-3 py-2 text-sm bg-background opacity-70 cursor-not-allowed"
                    value="Polska"
                    readOnly
                  />
                </Field>

                <div className="flex items-end gap-2">
                  <Field label="Miasto (PRG)">
                    <input
                      className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                      value={a.city}
                      readOnly
                      placeholder="Wybierz z PRG"
                    />
                  </Field>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted/40 disabled:opacity-50"
                    disabled={!isPrimary && isLinked}
                    onClick={() => setPrgOpenFor(a.label)}
                    title="Wyszukaj adres w PRG"
                  >
                    Szukaj PRG
                  </button>
                </div>

                <Field label="Kod pocztowy">
                  <TextInput
                    value={a.postal_code}
                    onChange={(v) =>
                      setAddresses((prev) => prev.map((x) => (x.label === a.label ? { ...x, postal_code: v } : x)))
                    }
                    disabled={!isPrimary && isLinked}
                    placeholder="np. 30-001"
                  />
                </Field>

                <Field label="Ulica (PRG)">
                  <input
                    className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                    value={a.street}
                    readOnly
                    placeholder="Wybierz z PRG"
                  />
                </Field>

                <Field label="Numer budynku (PRG)">
                  <input
                    className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                    value={a.building_no}
                    readOnly
                    placeholder="Wybierz z PRG"
                  />
                </Field>

                <Field label="Numer lokalu (opcjonalnie)">
                  <TextInput
                    value={a.apartment_no}
                    onChange={(v) =>
                      setAddresses((prev) => prev.map((x) => (x.label === a.label ? { ...x, apartment_no: v } : x)))
                    }
                    disabled={!isPrimary && isLinked}
                    placeholder="np. 12"
                  />
                </Field>
              </div>

              <div className="text-[11px] text-muted-foreground">
                TERC: <span className="font-mono">{a.terc || "—"}</span> • SIMC:{" "}
                <span className="font-mono">{a.simc || "—"}</span> • ULIC:{" "}
                <span className="font-mono">{a.ulic || "—"}</span>
              </div>

              <SimpleModal
                open={prgOpenFor === a.label}
                title="Wyszukiwarka lokalizacji (PRG)"
                description="Wybierz: miejscowość → ulica → budynek. TERC/SIMC/ULIC są pobierane z PRG."
                onClose={() => setPrgOpenFor(null)}
                className="w-[min(90vw,1100px)] h-[min(80vh,900px)] max-w-none"
                bodyClassName="p-4"
              >
                <PrgAddressFinder
                  onPick={(picked) => {
                    applyPrgPick(a.label, picked);
                    setPrgOpenFor(null);
                  }}
                />
              </SimpleModal>
            </div>
<div className="text-[11px] text-muted-foreground">
                {isPrimary
                  ? isBusiness
                    ? "Główny adres: siedziba firmy."
                    : "Główny adres: zamieszkania."
                  : isLinked
                    ? "Wartości są automatycznie kopiowane z adresu głównego (checkbox włączony)."
                    : "Wartości są niezależne (checkbox wyłączony)."}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function PlaceholderList({ title, items, hint }: { title: string; items: string[]; hint?: string }) {
  return (
    <Card title={title} desc={hint}>
      <ul className="list-disc ml-5 text-sm text-muted-foreground space-y-1">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </Card>
  );
}

export default function SubscriberDetailsPage({ params }: { params: { id: string } }) {
  // Next.js App Router: w Client Components parametry routingu są najpewniej dostępne przez useParams().
  // (Prop `params` bywa niepoprawny/undefined w zależności od wersji i trybu buildu).
  // Dlatego traktujemy `params` jako fallback, ale źródłem prawdy jest useParams().
  const routeParams = useParams<{ id?: string | string[] }>();

  const rawId = useMemo(() => {
    const fromHook = routeParams?.id;
    if (typeof fromHook === "string") return fromHook;
    if (Array.isArray(fromHook) && fromHook.length > 0) return fromHook[0] ?? "";
    return params?.id ?? "";
  }, [routeParams, params?.id]);

  const id = useMemo(() => {
    // Segment URL zwykle już jest "decoded", ale wolimy być odporni na encodeURIComponent().
    try {
      return decodeURIComponent(rawId);
    } catch {
      return rawId;
    }
  }, [rawId]);

  const all = useMemo(() => seedSubscribers(), []);
  const s = useMemo(() => all.find((x) => x.id === id) ?? null, [all, id]);
  // UI-only: Edycja danych abonenta jest dozwolona tylko, jeśli NIE ma żadnej podpisanej umowy.
  // Docelowo: to będzie backend rule + statusy kontraktów.
  const contracts = (s as any)?.contracts as Array<{ status?: string }> | undefined;
  const hasSignedContract = Boolean(
    contracts?.some((c) => {
      const st = (c.status ?? "").toString().toLowerCase();
      return st === "signed" || st === "planned" || st === "active" || st === "suspended" || st === "terminated";
    })
  );

  const [tab, setTab] = useState<TabKey>("dane");

  if (!s) {
    return (
      <div className="p-6 space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-semibold">Nie znaleziono abonenta</div>
          <div className="text-xs text-muted-foreground mt-1">UI-only: to są mocki. Wybierz jednego z listy.</div>
          <div className="mt-4">
            <Link href="/subscribers" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
              ← Lista abonentów
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="rounded-2xl border bg-card">
        <div className="p-4 border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">{s.display_name}</div>
              <div className="text-xs text-muted-foreground">
                {formatKind(s.kind)} · {formatStatus(s.status)} · ID: {s.id}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/subscribers" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                ← Lista
              </Link>
              <button
                type="button"
                disabled={hasSignedContract}
                title={
                  hasSignedContract
                    ? "Edycja zablokowana: istnieje podpisana umowa (chronimy historię faktur/umów)."
                    : "Edytuj dane abonenta (UI-only)"
                }
                className={[
                  "rounded-md border px-3 py-2 text-sm",
                  hasSignedContract ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/40",
                ].join(" ")}
                onClick={() => {
                  if (hasSignedContract) return;
                  alert("UI-only: edycję i walidacje dopniemy po zamknięciu UI.");
                }}
              >
                Edytuj
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-muted-foreground mb-2">Zakładki (jak w excelu):</div>
            <Tabs value={tab} onChange={setTab} />
          </div>
        </div>

        <div className="p-4">
          {tab === "dane" && <SubscriberBasics s={s} />}

          {tab === "adresy" && <Addresses s={s} />}

          {tab === "umowy" && (
            <PlaceholderList
              title="Umowy"
              hint="W excelu: lista + historia umów + link do treści umowy."
              items={[
                "Lista umów (draft/signed/planned/active/…) — placeholder",
                "Historia umów + podgląd dokumentów — placeholder",
                "Generator wzorów dokumentów (później) — placeholder",
              ]}
            />
          )}

          {tab === "uslugi" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PlaceholderList
                title="Usługi"
                hint="W excelu: Internet/TV/Telefonia + adresy IP + usługi dodatkowe."
                items={[
                  "Internet: pakiet + prędkości + polityka IP (None/NAT/Public) — placeholder",
                  "Telewizja: STB / AVIOS + pakiety — placeholder",
                  "Telefonia: billing + numery — placeholder",
                  "Adresy IP: przypisane do usługi + historia — placeholder",
                ]}
              />

              <PlaceholderList
                title="IP wymagane przez usługę"
                hint="To jest ten wybór z UI usług: nie wymaga / NAT / public + ilość."
                items={[
                  "Nie wymaga adresu IP",
                  "Wymaga NAT (qty) — placeholder",
                  "Wymaga zewnętrzny/publiczny (qty) — placeholder",
                  "Pobieranie z magazynu IP przy aktywacji (a nie przy samym podpisie) — placeholder",
                ]}
              />
            </div>
          )}

                    {tab === "plan_platnosci" && <SubscriberPaymentPlan subscriber={s} />}

          {tab === "rozliczenia" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PlaceholderList
                title="Faktury i wpłaty"
                hint="W excelu: faktury, wpłaty, windykacja, sprawy sądowe, ręczne dokumenty."
                items={[
                  "Faktury (lista + PDF) — placeholder",
                  "Wpłaty (lista + dopasowanie) — placeholder",
                  "Możliwość wystawienia faktury ręcznie (ADMIN) — placeholder",
                ]}
              />
              <PlaceholderList
                title="Windykacja"
                items={[
                  "Status windykacji / blokady — placeholder",
                  "Notatki i działania — placeholder",
                  "Sprawy sądowe — placeholder",
                ]}
              />
            </div>
          )}

          {tab === "sprzet" && <SubscriberEquipment s={s} />}

          {tab === "ont" && <SubscriberOnt s={s} />}

          {tab === "avios" && (
            <PlaceholderList
              title="AVIOS"
              hint="W excelu: pakiet TV, błędy, aktywacje/wyłączenia, co klient ogląda (z API)."
              items={[
                "Aktualny pakiet AVIOS — placeholder",
                "Sync i błędy integracji — placeholder",
                "Akcje: ustaw pakiet / wyłącz / odśwież — placeholder",
              ]}
            />
          )}

          {tab === "zgody" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card title="Zgody (stan)" desc="RODO (wymagana), e-faktury/panel, marketing + preferencje kanałów.">
                <KV k="RODO przetwarzanie" v={YesNo(s.consents.rodo_processing)} />
                <KV k="E-faktury / panel" v={YesNo(s.consents.e_invoice)} />
                <KV k="Marketing" v={YesNo(s.consents.marketing)} />
                <KV
                  k="Kanały (operacyjne)"
                  v={
                    [
                      s.consents.preferred_channels.ops_email ? "email" : null,
                      s.consents.preferred_channels.ops_sms ? "sms" : null,
                      s.consents.preferred_channels.ops_phone ? "telefon" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"
                  }
                />
                <KV
                  k="Kanały (marketing)"
                  v={
                    [
                      s.consents.preferred_channels.mkt_email ? "email" : null,
                      s.consents.preferred_channels.mkt_sms ? "sms" : null,
                      s.consents.preferred_channels.mkt_phone ? "telefon" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"
                  }
                />
              </Card>
              <PlaceholderList
                title="Historia zgód"
                hint="Docelowo: audyt (kto/kiedy/źródło), cofnięcie zgody działa od kolejnego okresu."
                items={[
                  "2026-02-20: RODO = true (staff/admin) — placeholder",
                  "2026-02-20: e-faktury = true (panel) — placeholder",
                  "—",
                ]}
              />
            </div>
          )}

          {tab === "historia" && (
            <PlaceholderList
              title="Historia / notatki"
              hint="UI-only: docelowo activity log + audit, zgodnie z naszymi zasadami."
              items={[
                "Log aktywności (kto/kiedy/co/skąd/przed/po) — placeholder",
                s.notes ? `Notatka: ${s.notes}` : "Notatki — brak",
              ]}
            />
          )}

          {tab === "korespondencja" && <CorrespondenceSms s={s} />}

          {tab === "zadania" && <SubscriberTasks s={s} />}
        </div>
      </div>
    </div>
  );
}