"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";

import type { SubscriberKind } from "@/lib/mockSubscribers";
import { formatKind } from "@/lib/mockSubscribers";

type Field = { key: string; label: string; placeholder?: string; helper?: string };

type PersonDocType = "id_card" | "passport";

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
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

function Input({ label, placeholder, helper }: { label: string; placeholder?: string; helper?: string }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder={placeholder} />
      {helper && <div className="text-xs text-muted-foreground mt-1">{helper}</div>}
    </label>
  );
}

function SelectKind({ value, onChange }: { value: SubscriberKind; onChange: (v: SubscriberKind) => void }) {
  const opts: SubscriberKind[] = [
    "person",
    "jdg",
    "spolka_cywilna",
    "spolka_osobowa",
    "spolka_kapitalowa",
    "fundacja",
    "jednostka_budzetowa",
  ];
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">Rodzaj abonenta</div>
      <select
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as SubscriberKind)}
      >
        {opts.map((o) => (
          <option key={o} value={o}>
            {formatKind(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{children}</div>;
}

type AddressKey =
  | "zamieszkania"
  | "zameldowania"
  | "siedziba_firmy"
  | "korespondencyjny"
  | "fakturowy"
  | "platnika";

type UiAddress = {
  key: AddressKey;
  country: string;
  city: string;
  postal_code: string;
  street: string;
  building_no: string;
  apartment_no: string;
  payer_name: string; // tylko dla płatnika (gdy odznaczone "identyczny")
};

function AddressInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <input
        className={[
          "w-full rounded-md border bg-background px-3 py-2 text-sm",
          disabled ? "opacity-70 cursor-not-allowed" : "",
        ].join(" ")}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function addressTitle(key: AddressKey): string {
  switch (key) {
    case "zamieszkania":
      return "Adres zamieszkania";
    case "zameldowania":
      return "Adres zameldowania";
    case "siedziba_firmy":
      return "Siedziba firmy";
    case "korespondencyjny":
      return "Adres korespondencyjny";
    case "fakturowy":
      return "Adres fakturowy";
    case "platnika":
      return "Adres płatnika";
    default:
      return key;
  }
}

function AddressesForm({ kind }: { kind: SubscriberKind }) {
  const isPerson = kind === "person";
  const isBusiness = kind !== "person"; // w tym UI: JDG + spółki + jednostki = firma
  const primaryKey: AddressKey = isPerson ? "zamieszkania" : "siedziba_firmy";
  const copyLabel = isPerson ? "adres zamieszkania" : "adres siedziby";

  const visibleKeys: AddressKey[] = isPerson
    ? ["zamieszkania", "zameldowania", "korespondencyjny", "fakturowy", "platnika"]
    : ["siedziba_firmy", "korespondencyjny", "fakturowy", "platnika"];

  const blank = (key: AddressKey): UiAddress => ({
    key,
    country: "PL",
    city: "",
    postal_code: "",
    street: "",
    building_no: "",
    apartment_no: "",
    payer_name: "",
  });

  const [addr, setAddr] = useState<Record<AddressKey, UiAddress>>(() => ({
    zamieszkania: blank("zamieszkania"),
    zameldowania: blank("zameldowania"),
    siedziba_firmy: blank("siedziba_firmy"),
    korespondencyjny: blank("korespondencyjny"),
    fakturowy: blank("fakturowy"),
    platnika: blank("platnika"),
  }));

  // checkboxy: domyślnie wszystkie poza głównym = identyczne
  const [sameAsPrimary, setSameAsPrimary] = useState<Record<AddressKey, boolean>>(() => ({
    zamieszkania: false,
    zameldowania: true,
    siedziba_firmy: false,
    korespondencyjny: true,
    fakturowy: true,
    platnika: true,
  }));

  const primary = addr[primaryKey];

  const setField = (key: AddressKey, field: keyof UiAddress, value: string) => {
    setAddr((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const copyFromPrimary = (targetKey: AddressKey) => {
    setAddr((prev) => ({
      ...prev,
      [targetKey]: {
        ...prev[targetKey],
        country: prev[primaryKey].country,
        city: prev[primaryKey].city,
        postal_code: prev[primaryKey].postal_code,
        street: prev[primaryKey].street,
        building_no: prev[primaryKey].building_no,
        apartment_no: prev[primaryKey].apartment_no,
      },
    }));
  };

  // gdy zmienia się adres główny: odśwież wszystkie “identyczne”
  useEffect(() => {
    visibleKeys.forEach((k) => {
      if (k === primaryKey) return;
      if (sameAsPrimary[k]) copyFromPrimary(k);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kind,
    primaryKey,
    primary.country,
    primary.city,
    primary.postal_code,
    primary.street,
    primary.building_no,
    primary.apartment_no,
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {visibleKeys.map((k) => {
        const isPrimary = k === primaryKey;
        const linked = !isPrimary && (sameAsPrimary[k] ?? true);
        const title = addressTitle(k);

        return (
          <div key={k} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {isPrimary
                    ? isBusiness
                      ? "Adres główny: siedziba."
                      : "Adres główny: zamieszkania."
                    : linked
                      ? `Identyczny jak ${copyLabel}.`
                      : "Adres niezależny (możesz wpisać inne dane)."}
                </div>
              </div>

              {!isPrimary && (
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <input
                    type="checkbox"
                    checked={sameAsPrimary[k] ?? true}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSameAsPrimary((prev) => ({ ...prev, [k]: checked }));
                      if (checked) {
                        copyFromPrimary(k);
                        if (k === "platnika") setField(k, "payer_name", "");
                      }
                    }}
                  />
                  identyczny jak {copyLabel}
                </label>
              )}
            </div>

            {k === "platnika" && !isPrimary && !linked && (
              <div className="mt-3">
                <AddressInput
                  label="Nazwa płatnika (pierwsza linia)"
                  value={addr[k].payer_name}
                  onChange={(v) => setField(k, "payer_name", v)}
                  placeholder="np. Jan Kowalski / ACME Sp. z o.o."
                />
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <AddressInput
                label="Państwo"
                value={addr[k].country}
                onChange={(v) => setField(k, "country", v)}
                placeholder="PL"
                disabled={!isPrimary && linked}
              />
              <AddressInput
                label="Miasto"
                value={addr[k].city}
                onChange={(v) => setField(k, "city", v)}
                placeholder="Kraków"
                disabled={!isPrimary && linked}
              />
              <AddressInput
                label="Kod"
                value={addr[k].postal_code}
                onChange={(v) => setField(k, "postal_code", v)}
                placeholder="30-001"
                disabled={!isPrimary && linked}
              />
              <AddressInput
                label="Ulica"
                value={addr[k].street}
                onChange={(v) => setField(k, "street", v)}
                placeholder="Promienistych"
                disabled={!isPrimary && linked}
              />
              <AddressInput
                label="Numer budynku"
                value={addr[k].building_no}
                onChange={(v) => setField(k, "building_no", v)}
                placeholder="11"
                disabled={!isPrimary && linked}
              />
              <AddressInput
                label="Numer lokalu"
                value={addr[k].apartment_no}
                onChange={(v) => setField(k, "apartment_no", v)}
                placeholder="(opcjonalnie)"
                disabled={!isPrimary && linked}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SubscriberNewPage() {
  const [kind, setKind] = useState<SubscriberKind>("person");
  const [personDoc, setPersonDoc] = useState<PersonDocType>("id_card");
  const [reps, setReps] = useState<Array<{ first_name: string; last_name: string }>>([
    { first_name: "", last_name: "" },
  ]);

  const isCompany = kind !== "person";
  const showCeidg = kind === "jdg" || kind === "spolka_cywilna";
  const showKrs = kind === "spolka_osobowa" || kind === "spolka_kapitalowa" || kind === "fundacja";

  const fields = useMemo(() => {
    const base: Field[] = [
      { key: "email", label: "E-mail", placeholder: "np. jan@domena.pl" },
      { key: "phone", label: "Numer telefonu", placeholder: "+48 …" },
      { key: "panel_login", label: "Login w panelu klienta", placeholder: "(opcjonalnie)" },
    ];

    const person: Field[] = [
      { key: "first_name", label: "Imię" },
      { key: "last_name", label: "Nazwisko" },
      ...(personDoc === "id_card"
        ? ([
            { key: "pesel", label: "PESEL" },
            { key: "id_no", label: "Seria i numer dowodu" },
          ] as Field[])
        : ([
            { key: "passport_no", label: "Seria i numer paszportu / dokumentu EU" },
            { key: "passport_country", label: "Kraj wydania" },
          ] as Field[])),
      { key: "kyc_scan", label: "Skan dokumentu KYC", helper: "UI-only: docelowo upload + audyt" },
    ];

    const companyCore: Field[] = [
      { key: "name", label: "Nazwa" },
      { key: "nip", label: "NIP" },
      { key: "regon", label: "REGON" },
      ...(showKrs ? ([{ key: "krs", label: "KRS" }] as Field[]) : []),
      ...(showCeidg ? ([{ key: "ceidg", label: "CEIDG" }] as Field[]) : []),
    ];

    if (kind === "person") return [...person, ...base];
    if (kind === "jdg") return [{ key: "owner", label: "Imię i nazwisko właściciela" }, ...companyCore, ...base];
    if (kind === "spolka_cywilna")
      return [{ key: "partners", label: "Wspólnicy (opcjonalnie)" }, ...companyCore, ...base];
    if (kind === "jednostka_budzetowa")
      return [{ key: "unit_name", label: "Nazwa jednostki" }, ...companyCore, ...base];
    return [...companyCore, ...base];
  }, [kind, personDoc, showCeidg, showKrs]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Abonenci → Dodaj abonenta</div>
          <div className="text-xs text-muted-foreground">
            Ślepe UI: formularz zgodny z Twoją matrycą pól (excel). Walidacje i backend dopniemy po zamknięciu UI.
          </div>
        </div>
        <Link href="/subscribers" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
          ← Wróć
        </Link>
      </div>

      <Section title="Tożsamość i kontakt" desc="Rodzaj abonenta steruje tym, które pola są widoczne (osoba/JDG/spółki/jednostka).">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <SelectKind value={kind} onChange={setKind} />
          </div>
          <div className="md:col-span-2 rounded-lg border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">Szybka podpowiedź</div>
            <div className="text-sm mt-1">
              Wybrano: <span className="font-medium">{formatKind(kind)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {isCompany ? (
                <>
                  {showCeidg && !showKrs && "Ten typ pokazuje CEIDG (bez KRS)."}
                  {showKrs && !showCeidg && "Ten typ pokazuje KRS (bez CEIDG)."}
                  {!showKrs && !showCeidg && "Ten typ nie wymaga KRS ani CEIDG."}
                </>
              ) : (
                <>Dla osoby fizycznej wybierasz typ dokumentu: dowód (PESEL + seria/numer) albo paszport (seria/numer + kraj wydania).</>
              )}
            </div>
          </div>
        </div>

        {kind === "person" && (
          <div className="mt-4 rounded-xl border bg-card p-4">
            <div className="text-sm font-semibold">Dokument tożsamości</div>
            <div className="text-xs text-muted-foreground mt-1">UI-only: to tylko steruje widocznością pól.</div>

            <div className="mt-3 flex flex-col md:flex-row md:items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="person_doc"
                  checked={personDoc === "id_card"}
                  onChange={() => setPersonDoc("id_card")}
                />
                Dowód osobisty (PL)
              </label>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="person_doc"
                  checked={personDoc === "passport"}
                  onChange={() => setPersonDoc("passport")}
                />
                Paszport / dokument EU
              </label>
            </div>
          </div>
        )}

        {isCompany && (
          <div className="mt-4 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Reprezentanci (wymagane)</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Dla każdej firmy/jednostki musimy mieć co najmniej jedną osobę upoważnioną do reprezentacji (Imię + Nazwisko).
                </div>
              </div>

              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                onClick={() => setReps((prev) => [...prev, { first_name: "", last_name: "" }])}
              >
                + Dodaj osobę
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {reps.map((r, idx) => (
                <div key={idx} className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">Osoba #{idx + 1}</div>
                    <button
                      type="button"
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted/40"
                      onClick={() =>
                        setReps((prev) => {
                          if (prev.length <= 1) return prev; // nie pozwalamy zejść poniżej 1
                          return prev.filter((_, i) => i !== idx);
                        })
                      }
                    >
                      Usuń
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                      <div className="text-xs text-muted-foreground mb-1">Imię</div>
                      <input
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={r.first_name}
                        onChange={(e) =>
                          setReps((prev) => prev.map((x, i) => (i === idx ? { ...x, first_name: e.target.value } : x)))
                        }
                      />
                    </label>
                    <label className="block">
                      <div className="text-xs text-muted-foreground mb-1">Nazwisko</div>
                      <input
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={r.last_name}
                        onChange={(e) =>
                          setReps((prev) => prev.map((x, i) => (i === idx ? { ...x, last_name: e.target.value } : x)))
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              UI-only: na razie nie zapisujemy. Docelowo: walidacja backendowa + audit (kto dodał/zmienił).
            </div>
          </div>
        )}

        <div className="mt-4">
          <Grid>
            {fields.map((f) => (
              <Input key={f.key} label={f.label} placeholder={f.placeholder} helper={f.helper} />
            ))}
          </Grid>
        </div>
      </Section>

      <Section
        title="Adresy"
        desc="Zasada: pola są zawsze widoczne. Checkbox tylko przepisuje wartości z adresu głównego, żeby było widać co faktycznie jest wpisane."
      >
        <AddressesForm kind={kind} />
      </Section>

      <Section title="Zgody" desc="RODO (wymagana), e-faktury/panel, marketing + preferencje kanałów.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" defaultChecked />
              <span>
                Zgoda na przetwarzanie danych osobowych (wymagana)
                <div className="text-xs text-muted-foreground">Bez tej zgody nie zawieramy umowy.</div>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" defaultChecked />
              <span>
                Zgoda na e-faktury / panel klienta
                <div className="text-xs text-muted-foreground">Docelowo: rabat X PLN/mc (konfig).</div>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" />
              <span>
                Zgoda marketingowa (oferty)
                <div className="text-xs text-muted-foreground">Docelowo: rabat X PLN/mc (konfig).</div>
              </span>
            </label>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-semibold">Preferowane kanały</div>
            <div className="text-xs text-muted-foreground mt-1">Oddzielnie: komunikacja operacyjna vs marketing.</div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-sm font-medium">Operacyjne</div>
                <div className="mt-2 space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked /> e-mail
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked /> SMS
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked /> telefon
                  </label>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-sm font-medium">Marketing</div>
                <div className="mt-2 space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" /> e-mail
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" /> SMS
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" /> telefon
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Zapis</div>
          <div className="text-xs text-muted-foreground">UI-only: przycisk nie zapisuje do backendu (na razie).</div>
        </div>
        <button
          type="button"
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90"
          onClick={() => alert("UI-only: zapis abonenta podepniemy po zamknięciu całego UI.")}
        >
          Zapisz abonenta
        </button>
      </div>
    </div>
  );
}