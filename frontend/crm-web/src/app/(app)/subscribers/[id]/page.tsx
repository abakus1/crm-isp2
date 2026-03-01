"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatKind, formatStatus, seedSubscribers, type SubscriberRecord } from "@/lib/mockSubscribers";

type TabKey =
  | "dane"
  | "adresy"
  | "umowy"
  | "uslugi"
  | "urzadzenia"
  | "rozliczenia"
  | "gpon"
  | "avios"
  | "zgody"
  | "historia";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "dane", label: "Dane" },
  { key: "adresy", label: "Adresy" },
  { key: "umowy", label: "Umowy" },
  { key: "uslugi", label: "Usługi" },
  { key: "urzadzenia", label: "Urządzenia" },
  { key: "rozliczenia", label: "Rozliczenia" },
  { key: "gpon", label: "GPON" },
  { key: "avios", label: "AVIOS" },
  { key: "zgody", label: "Zgody" },
  { key: "historia", label: "Historia" },
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

function SubscriberBasics({ s }: { s: SubscriberRecord }) {
  const isPerson = s.kind === "person";
  const isJdg = s.kind === "jdg";
  const isCompany = s.kind === "spolka_os" || s.kind === "spolka_praw" || s.kind === "jednostka";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card
        title="Usługobiorca"
        desc="Pola bazowe z excela (UI-only). Docelowo: walidacje + profil wersjonowany + audit."
      >
        <KV k="Rodzaj abonenta" v={formatKind(s.kind)} />
        <KV k="Status" v={formatStatus(s.status)} />
        <KV k="Obywatelstwo" v={s.citizenship} />

        {(isPerson || isJdg) && <KV k="Imię" v={s.first_name} />}
        {(isPerson || isJdg) && <KV k="Nazwisko" v={s.last_name} />}

        {(isJdg || isCompany) && <KV k="Nazwa" v={s.company_name ?? s.display_name} />}
        {(isJdg || isCompany) && <KV k="NIP" v={s.nip} />}
        {isCompany && <KV k="KRS" v={s.krs} />}
        {(isJdg || isCompany) && <KV k="REGON" v={s.regon} />}
        {isJdg && <KV k="CEIDG" v={s.ceidg} />}

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

function Addresses({ s }: { s: SubscriberRecord }) {
  const labelMap: Record<string, string> = {
    siedziba_firmy: "Siedziba firmy",
    zameldowania: "Adres zameldowania",
    zamieszkania: "Adres zamieszkania",
    korespondencyjny: "Adres korespondencyjny",
    fakturowy: "Adres fakturowy",
    platnika: "Adres płatnika",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {s.addresses.length === 0 && (
        <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">Brak adresów (placeholder)</div>
      )}
      {s.addresses.map((a, idx) => (
        <Card key={`${a.label}-${idx}`} title={labelMap[a.label] ?? a.label} desc={a.note}>
          <div className="text-sm">
            {a.street} {a.building_no}
            {a.apartment_no ? `/${a.apartment_no}` : ""}
          </div>
          <div className="text-sm">
            {a.postal_code} {a.city}
          </div>
          <div className="text-xs text-muted-foreground mt-2">{a.country}</div>
        </Card>
      ))}
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
  const all = useMemo(() => seedSubscribers(), []);
  const s = useMemo(() => all.find((x) => x.id === params.id) ?? null, [all, params.id]);
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
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                onClick={() => alert("UI-only: edycję i walidacje dopniemy po zamknięciu UI.")}
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
        </div>
      </div>
    </div>
  );
}