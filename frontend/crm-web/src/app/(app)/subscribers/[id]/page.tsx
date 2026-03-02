"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

type UiAddress = {
  label: string;
  note?: string;
  street: string;
  building_no: string;
  apartment_no?: string;
  postal_code: string;
  city: string;
  country: string;

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
  const labelMap: Record<string, string> = {
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

  const primaryLabel = isBusiness ? "siedziba_firmy" : "zamieszkania";
  const primaryCopyLabel = isBusiness ? "adres siedziby" : "adres zamieszkania";

  const initialAddresses = useMemo<UiAddress[]>(() => {
    return (s.addresses ?? []).map((a) => ({
      label: a.label,
      note: a.note,
      street: a.street ?? "",
      building_no: a.building_no ?? "",
      apartment_no: a.apartment_no ?? "",
      postal_code: a.postal_code ?? "",
      city: a.city ?? "",
      country: a.country ?? "",
      payer_name: "",
    }));
  }, [s.addresses]);

  const [addresses, setAddresses] = useState<UiAddress[]>(initialAddresses);

  // checkboxy: które adresy są “identyczne jak główny”
  const [sameAsPrimary, setSameAsPrimary] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    (s.addresses ?? []).forEach((a) => {
      if (a.label === primaryLabel) return;
      map[a.label] = true; // domyślnie: identyczne (Twoja zasada “standardowo pozostałe mają checkbox”)
    });
    return map;
  });

  // helper: kopiowanie z adresu głównego
  const primary = useMemo(() => addresses.find((a) => a.label === primaryLabel) ?? null, [addresses, primaryLabel]);

  const copyFromPrimary = (label: string) => {
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
        };
      })
    );
  }, [primary?.street, primary?.building_no, primary?.apartment_no, primary?.postal_code, primary?.city, primary?.country, primaryLabel, sameAsPrimary, primary]);

  if (!addresses || addresses.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">Brak adresów (placeholder)</div>
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
                    setAddresses((prev) => prev.map((x) => (x.label === a.label ? { ...x, payer_name: v } : x)))
                  }
                  placeholder="np. Jan Kowalski / ACME Sp. z o.o."
                />
              </Field>
            )}

            <div className="grid grid-cols-1 gap-3">
              <Field label="Ulica">
                <TextInput
                  value={a.street}
                  disabled={!isPrimary && isLinked}
                  onChange={(v) =>
                    setAddresses((prev) => prev.map((x) => (x.label === a.label ? { ...x, street: v } : x)))
                  }
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Nr budynku">
                  <TextInput
                    value={a.building_no}
                    disabled={!isPrimary && isLinked}
                    onChange={(v) =>
                      setAddresses((prev) => prev.map((x) => (x.label === a.label ? { ...x, building_no: v } : x)))
                    }
                  />
                </Field>

                <Field label="Nr lokalu">
                  <TextInput
                    value={a.apartment_no}
                    disabled={!isPrimary && isLinked}
                    onChange={(v) =>
                      setAddresses((prev) => prev.map((x) => (x.label === a.label ? { ...x, apartment_no: v } : x)))
                    }
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Kod pocztowy">
                  <TextInput
                    value={a.postal_code}
                    disabled={!isPrimary && isLinked}
                    onChange={(v) =>
                      setAddresses((prev) => prev.map((x) => (x.label === a.label ? { ...x, postal_code: v } : x)))
                    }
                  />
                </Field>

                <Field label="Miasto">
                  <TextInput
                    value={a.city}
                    disabled={!isPrimary && isLinked}
                    onChange={(v) =>
                      setAddresses((prev) => prev.map((x) => (x.label === a.label ? { ...x, city: v } : x)))
                    }
                  />
                </Field>
              </div>

              <Field label="Kraj">
                <TextInput
                  value={a.country}
                  disabled={!isPrimary && isLinked}
                  onChange={(v) =>
                    setAddresses((prev) => prev.map((x) => (x.label === a.label ? { ...x, country: v } : x)))
                  }
                />
              </Field>

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
                items={["Status windykacji / blokady — placeholder", "Notatki i działania — placeholder", "Sprawy sądowe — placeholder"]}
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
                items={["2026-02-20: RODO = true (staff/admin) — placeholder", "2026-02-20: e-faktury = true (panel) — placeholder", "—"]}
              />
            </div>
          )}

          {tab === "historia" && (
            <PlaceholderList
              title="Historia / notatki"
              hint="UI-only: docelowo activity log + audit, zgodnie z naszymi zasadami."
              items={["Log aktywności (kto/kiedy/co/skąd/przed/po) — placeholder", s.notes ? `Notatka: ${s.notes}` : "Notatki — brak"]}
            />
          )}
        </div>
      </div>
    </div>
  );
}