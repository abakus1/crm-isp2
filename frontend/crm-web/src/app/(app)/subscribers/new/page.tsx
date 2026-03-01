"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { SubscriberKind } from "@/lib/mockSubscribers";
import { formatKind } from "@/lib/mockSubscribers";

type Field = { key: string; label: string; placeholder?: string; helper?: string };

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
  const opts: SubscriberKind[] = ["person", "jdg", "spolka_os", "spolka_praw", "jednostka"];
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

export default function SubscriberNewPage() {
  const [kind, setKind] = useState<SubscriberKind>("person");

  const fields = useMemo(() => {
    const base: Field[] = [
      { key: "email", label: "E-mail", placeholder: "np. jan@domena.pl" },
      { key: "phone", label: "Numer telefonu", placeholder: "+48 …" },
      { key: "panel_login", label: "Login w panelu klienta", placeholder: "(opcjonalnie)" },
    ];

    const person: Field[] = [
      { key: "first_name", label: "Imię" },
      { key: "last_name", label: "Nazwisko" },
      { key: "pesel", label: "PESEL" },
      { key: "id_no", label: "Seria i numer dowodu" },
      { key: "passport", label: "Seria paszportu/dowodu EU", helper: "użyj, jeśli nie ma dowodu PL" },
      { key: "kyc_scan", label: "Skan dokumentu KYC", helper: "UI-only: docelowo upload + audyt" },
    ];

    const company: Field[] = [
      { key: "name", label: "Nazwa" },
      { key: "nip", label: "NIP" },
      { key: "regon", label: "REGON" },
      { key: "krs", label: "KRS" },
      { key: "ceidg", label: "CEIDG" },
    ];

    if (kind === "person") return [...person, ...base];
    if (kind === "jdg") return [{ key: "owner", label: "Imię i nazwisko właściciela" }, ...company, ...base];
    if (kind === "spolka_os") return [...company, ...base];
    if (kind === "spolka_praw") return [...company, ...base];
    return [{ key: "unit_name", label: "Nazwa jednostki" }, ...company, ...base];
  }, [kind]);

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
            <div className="text-xs text-muted-foreground mt-1">Pola typu NIP/KRS/CEIDG pokażą się tylko tam, gdzie mają sens.</div>
          </div>
        </div>

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
        desc="Z excela: siedziba firmy / zameldowania / zamieszkania / korespondencyjny / fakturowy / płatnika. Tu tylko układ UI."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[
            "Siedziba firmy",
            "Adres zameldowania",
            "Adres zamieszkania",
            "Adres korespondencyjny",
            "Adres fakturowy",
            "Adres płatnika",
          ].map((t) => (
            <div key={t} className="rounded-xl border bg-card p-4">
              <div className="text-sm font-semibold">{t}</div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label="Państwo" placeholder="PL" />
                <Input label="Miasto" placeholder="Kraków" />
                <Input label="Kod" placeholder="30-001" />
                <Input label="Ulica" placeholder="Promienistych" />
                <Input label="Numer budynku" placeholder="11" />
                <Input label="Numer lokalu" placeholder="(opcjonalnie)" />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border bg-muted/20 p-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" />
            wszystkie dane adresowe przepisane (kopiuj z wybranego adresu) — placeholder
          </label>
        </div>
      </Section>

      <Section title="Zgody" desc="RODO (wymagana), e‑faktury/panel, marketing + preferencje kanałów.">
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
                Zgoda na e‑faktury / panel klienta
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
                    <input type="checkbox" defaultChecked /> e‑mail
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
                    <input type="checkbox" /> e‑mail
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
