export type SubscriberKind = "person" | "jdg" | "spolka_os" | "spolka_praw" | "jednostka";

export type SubscriberStatus =
  | "interested"
  | "order"
  | "inactive"
  | "active"
  | "suspended"
  | "blocked"
  | "to_terminate"
  | "collection"
  | "archived";

export type ConsentState = {
  rodo_processing: boolean;
  e_invoice: boolean;
  marketing: boolean;
  preferred_channels: {
    ops_email: boolean;
    ops_sms: boolean;
    ops_phone: boolean;
    mkt_email: boolean;
    mkt_sms: boolean;
    mkt_phone: boolean;
  };
};

export type SubscriberAddress = {
  label: "siedziba_firmy" | "zameldowania" | "zamieszkania" | "korespondencyjny" | "fakturowy" | "platnika";
  country: string;
  city: string;
  postal_code: string;
  street: string;
  building_no: string;
  apartment_no?: string;
  note?: string;
};

export type SubscriberRecord = {
  id: string;
  kind: SubscriberKind;
  status: SubscriberStatus;
  display_name: string;

  citizenship?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  ceidg?: string;

  email?: string;
  phone?: string;
  pesel?: string;
  nip?: string;
  krs?: string;
  regon?: string;

  id_card_no?: string;
  passport_no?: string;
  eu_doc_no?: string;
  kyc_doc_ref?: string;

  created_at: string;
  notes?: string;
  consents: ConsentState;
  addresses: SubscriberAddress[];
};

export function formatKind(k: SubscriberKind): string {
  switch (k) {
    case "person":
      return "Osoba fizyczna";
    case "jdg":
      return "JDG";
    case "spolka_os":
      return "Spółka osobowa";
    case "spolka_praw":
      return "Spółka prawa";
    case "jednostka":
      return "Jednostka budżetowa";
    default:
      return k;
  }
}

export function formatStatus(s: SubscriberStatus): string {
  switch (s) {
    case "interested":
      return "Zainteresowany";
    case "order":
      return "Zamówienie";
    case "inactive":
      return "Nieaktywny";
    case "active":
      return "Aktywny";
    case "suspended":
      return "Zawieszony";
    case "blocked":
      return "Zablokowany";
    case "to_terminate":
      return "Do rozwiązania";
    case "collection":
      return "Windykacja";
    case "archived":
      return "Archiwalny";
    default:
      return s;
  }
}

export function seedSubscribers(): SubscriberRecord[] {
  const baseConsents: ConsentState = {
    rodo_processing: true,
    e_invoice: true,
    marketing: false,
    preferred_channels: {
      ops_email: true,
      ops_sms: true,
      ops_phone: true,
      mkt_email: false,
      mkt_sms: false,
      mkt_phone: false,
    },
  };

  return [
    {
      id: "sub_0001",
      kind: "person",
      status: "active",
      display_name: "Jan Kowalski",
      citizenship: "Polak",
      first_name: "Jan",
      last_name: "Kowalski",
      email: "jan.kowalski@example.com",
      phone: "+48 600 100 200",
      pesel: "80010112345",
      id_card_no: "ABC123456",
      kyc_doc_ref: "KYC-0001 (placeholder)",
      created_at: "2026-02-20",
      consents: baseConsents,
      addresses: [
        {
          label: "zamieszkania",
          country: "PL",
          city: "Kraków",
          postal_code: "30-001",
          street: "Promienistych",
          building_no: "11",
          apartment_no: "4",
        },
        {
          label: "fakturowy",
          country: "PL",
          city: "Kraków",
          postal_code: "30-001",
          street: "Promienistych",
          building_no: "11",
          apartment_no: "4",
        },
      ],
    },
    {
      id: "sub_0002",
      kind: "jdg",
      status: "order",
      display_name: "Studio Pixel (A. Nowak)",
      citizenship: "Polak",
      first_name: "Anna",
      last_name: "Nowak",
      company_name: "Studio Pixel",
      ceidg: "CEIDG-123456 (placeholder)",
      email: "kontakt@studiopixel.pl",
      phone: "+48 600 555 111",
      nip: "6761234567",
      regon: "123456789",
      id_card_no: "DEF654321",
      kyc_doc_ref: "KYC-0002 (placeholder)",
      created_at: "2026-02-26",
      notes: "Wymaga NAT + 2 adresy publiczne dla usług dodatkowych (placeholder).",
      consents: { ...baseConsents, marketing: true },
      addresses: [
        {
          label: "siedziba_firmy",
          country: "PL",
          city: "Kraków",
          postal_code: "31-000",
          street: "Długa",
          building_no: "8",
        },
        {
          label: "korespondencyjny",
          country: "PL",
          city: "Kraków",
          postal_code: "31-000",
          street: "Długa",
          building_no: "8",
          note: "Preferuje kontakt mailowy.",
        },
      ],
    },
    {
      id: "sub_0003",
      kind: "spolka_praw",
      status: "inactive",
      display_name: "Gemini Sample Sp. z o.o.",
      citizenship: "PL",
      company_name: "Gemini Sample Sp. z o.o.",
      email: "biuro@gemini-sample.pl",
      phone: "+48 600 999 000",
      nip: "9450000000",
      krs: "0000123456",
      regon: "987654321",
      kyc_doc_ref: "KYC-0003 (placeholder)",
      created_at: "2025-12-01",
      consents: baseConsents,
      addresses: [
        {
          label: "siedziba_firmy",
          country: "PL",
          city: "Kraków",
          postal_code: "30-002",
          street: "Rynek",
          building_no: "1",
        },
        {
          label: "platnika",
          country: "PL",
          city: "Kraków",
          postal_code: "30-002",
          street: "Rynek",
          building_no: "1",
          note: "Płatnik = spółka-matka (placeholder).",
        },
      ],
    },
  ];
}