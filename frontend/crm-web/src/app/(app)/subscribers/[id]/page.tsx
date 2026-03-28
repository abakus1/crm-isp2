"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SimpleModal } from "@/components/SimpleModal";
import { PrgAddressFinder, type PrgAddressPick } from "@/components/PrgAddressFinder";
import { ApiError, apiFetch } from "@/lib/api";

import { SubscriberPaymentPlan } from "./SubscriberPaymentPlan";
import { getStaffLabel, getTasksForSubscriber } from "@/lib/mockTasks";
import { useAuth } from "@/lib/auth";
import { formatKind, formatStatus, seedSubscribers, type SubscriberRecord } from "@/lib/mockSubscribers";

type TabKey =
  | "dane"
  | "adresy"
  | "umowy"
  | "uslugi"
  | "urzadzenia"
  | "plan_platnosci"
  | "rozliczenia"
  | "gpon"
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
  { key: "urzadzenia", label: "Urządzenia" },
  { key: "plan_platnosci", label: "Plan płatności" },
  { key: "rozliczenia", label: "Rozliczenia" },
  { key: "gpon", label: "GPON" },
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

          {tab === "urzadzenia" && (
            <PlaceholderList
              title="Urządzenia"
              hint="W excelu: wszystkie urządzenia wydane na klienta + zwroty + historia."
              items={[
                "Lista urządzeń (ONT/STB/router) wydanych do abonenta — placeholder",
                "Dokument wydania/wypożyczenia jako załącznik do umowy — placeholder",
                "Zwroty + daty + protokoły — placeholder",
              ]}
            />
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

          {tab === "gpon" && (
            <PlaceholderList
              title="GPON"
              hint="W excelu: ONT wydany, status mocy sygnału, reset/restart, historia."
              items={[
                "ONT przypisany do abonenta — placeholder",
                "Status mocy sygnału (Rx/Tx) — placeholder",
                "Możliwość restartu urządzenia — placeholder",
                "Historia aktywności — placeholder",
              ]}
            />
          )}

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