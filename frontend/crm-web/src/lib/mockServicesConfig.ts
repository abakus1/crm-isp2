export type ServiceFamily = {
  id: string;
  code: string;
  name: string;
  status: "active" | "archived";
  effectiveFrom: string; // ISO-like
};

export type ServiceTerm = {
  id: string;
  name: string;
  termMonths: number | null; // null = bezterminowa
  status: "active" | "archived";
  effectiveFrom: string;
  // Okno sprzedaży / używalności terminu (w UI). null = bez ograniczeń.
  saleFrom?: string;
  saleTo?: string | null;
};

export type ServicePlan = {
  id: string;
  type: "primary" | "addon";
  name: string;
  familyId: string;
  termId: string;
  billingProductCode: string;
  status: "active" | "archived";
  subscribersCount: number;
  effectiveFrom: string;

  // Ceny w miesiącach (M1..Mx). Dla bezterminowych w UI i tak pokazujemy X pól (np. 24).
  monthPrices: number[];

  // Jednorazowa opłata aktywacyjna dla usługi (w przyszłości: payment_plan_item_type=activation_fee).
  activationFee: number;

  // Parametry techniczne do provisioning'u (np. kolejki QoS na routerze). Dla addonów zwykle puste.
  downloadBps?: number; // Pobieranie w bit/s
  uploadBps?: number;   // Wysyłanie w bit/s

  // Wartości referencyjne dla ceny "na czas nieokreślony" (pod liczenie ulgi)
  // To NIE jest to samo co monthPrices (promocje). To jest "regularna" cena po okresie zobowiązania.
  indefiniteMonthlyPrice: number;
  indefiniteActivationFee: number;

  // Okno sprzedaży planu (od–do). "Wyłączenie" planu nie usuwa subskrybentów, blokuje sprzedaż.
  saleFrom: string;
  saleTo: string | null;

  // Po zakończeniu zobowiązania (umowy na czas określony) usługa przechodzi na czas nieokreślony.
  // Jednorazowa podwyżka po końcu zobowiązania:
  postTermIncreaseAmount: number; // 0 = brak

  // Cykliczny wzrost: co 12 miesięcy po zakończonej umowie.
  isCyclic: boolean;

  // Zależności primary -> addony (definicja ofert/konfiguracji)
  requiredAddonPlanIds: string[];
  optionalAddonPlanIds: string[];

  // Addon: czy wymaga urządzenia (pod magazyn) + dozwolone kategorie urządzeń
  requiresDevice?: boolean;
  allowedDeviceCategories?: string[];
};

function fillMonthPrices(base: number, months: number) {
  return Array.from({ length: months }, () => base);
}

export function seedFamilies(): ServiceFamily[] {
  return [
    { id: "fam-inet", code: "INET", name: "Internet", status: "active", effectiveFrom: "2026-01-01" },
    { id: "fam-tv", code: "TV", name: "Telewizja", status: "active", effectiveFrom: "2026-01-01" },
    { id: "fam-ip", code: "IP", name: "Adresy IP", status: "active", effectiveFrom: "2026-01-01" },
  ];
}

export function seedTerms(): ServiceTerm[] {
  return [
    {
      id: "term-undef",
      name: "Na czas nieokreślony",
      termMonths: null,
      status: "active",
      effectiveFrom: "2026-01-01",
      saleFrom: "2026-01-01",
      saleTo: null,
    },
    {
      id: "term-12",
      name: "12 miesięcy",
      termMonths: 12,
      status: "active",
      effectiveFrom: "2026-01-01",
      saleFrom: "2026-01-01",
      saleTo: null,
    },
    {
      id: "term-24",
      name: "24 miesiące",
      termMonths: 24,
      status: "active",
      effectiveFrom: "2026-01-01",
      saleFrom: "2026-01-01",
      saleTo: null,
    },
  ];
}

export function seedPlans(): ServicePlan[] {
  // UI pokazuje 24 pola, jeśli termMonths = null (bezterminowa) – żeby nie było "CSV hell".
  const uiDefaultMonths = 24;

  return [
    {
      id: "plan-inet-300-24",
      type: "primary",
      name: "Internet 300 (24m)",
      familyId: "fam-inet",
      termId: "term-24",
      billingProductCode: "INTERNET_300",
      status: "active",
      subscribersCount: 412,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(69, 24).map((v, i) => (i >= 20 ? 79 : v)),
      activationFee: 1,
      downloadBps: 300_000_000,
      uploadBps: 50_000_000,
    indefiniteMonthlyPrice: 79,
    indefiniteActivationFee: 199,

      saleFrom: "2026-01-01",
      saleTo: null,
      postTermIncreaseAmount: 10,
      isCyclic: true,
      requiredAddonPlanIds: ["plan-addon-ont"],
      optionalAddonPlanIds: ["plan-addon-ip-public"],
    },
    {
      id: "plan-tv-std-24",
      type: "primary",
      name: "TV Standard (24m)",
      familyId: "fam-tv",
      termId: "term-24",
      billingProductCode: "TV_STD",
      status: "active",
      subscribersCount: 210,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(39, 24),
      activationFee: 1,
      downloadBps: 0,
      uploadBps: 0,
    indefiniteMonthlyPrice: 79,
    indefiniteActivationFee: 199,

      saleFrom: "2026-01-01",
      saleTo: null,
      postTermIncreaseAmount: 5,
      isCyclic: true,
      requiredAddonPlanIds: ["plan-addon-stb"],
      optionalAddonPlanIds: [],
    },
    {
      id: "plan-addon-ont",
      type: "addon",
      name: "Dzierżawa ONT",
      familyId: "fam-inet",
      termId: "term-undef",
      billingProductCode: "ONT_RENT",
      status: "active",
      subscribersCount: 500,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(10, uiDefaultMonths),
      activationFee: 0,
    indefiniteMonthlyPrice: 79,
    indefiniteActivationFee: 199,

      saleFrom: "2026-01-01",
      saleTo: null,
      postTermIncreaseAmount: 0,
      isCyclic: false,
      requiredAddonPlanIds: [],
      optionalAddonPlanIds: [],
      requiresDevice: true,
      allowedDeviceCategories: ["ONT"],
    },
    {
      id: "plan-addon-stb",
      type: "addon",
      name: "Dzierżawa STB",
      familyId: "fam-tv",
      termId: "term-undef",
      billingProductCode: "STB_RENT",
      status: "active",
      subscribersCount: 260,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(12, uiDefaultMonths),
      activationFee: 0,
    indefiniteMonthlyPrice: 79,
    indefiniteActivationFee: 199,

      saleFrom: "2026-01-01",
      saleTo: null,
      postTermIncreaseAmount: 0,
      isCyclic: false,
      requiredAddonPlanIds: [],
      optionalAddonPlanIds: [],
      requiresDevice: true,
      allowedDeviceCategories: ["STB"],
    },
    {
      id: "plan-addon-ip-public",
      type: "addon",
      name: "Zewnętrzny adres IPv4",
      familyId: "fam-ip",
      termId: "term-undef",
      billingProductCode: "IP_PUBLIC",
      status: "active",
      subscribersCount: 98,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(20, uiDefaultMonths),
      activationFee: 0,
    indefiniteMonthlyPrice: 79,
    indefiniteActivationFee: 199,

      saleFrom: "2026-01-01",
      saleTo: null,
      postTermIncreaseAmount: 0,
      isCyclic: false,
      requiredAddonPlanIds: [],
      optionalAddonPlanIds: [],
      requiresDevice: false,
      allowedDeviceCategories: [],
    },
  ];
}

export function formatStatus(status: "active" | "archived") {
  return status === "active" ? "Aktywna" : "Archiwalna";
}
