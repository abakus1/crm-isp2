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
  month1Price: number;
};

export function seedFamilies(): ServiceFamily[] {
  return [
    { id: "fam-inet", code: "INET", name: "Internet", status: "active", effectiveFrom: "2026-01-01" },
    { id: "fam-tv", code: "TV", name: "Telewizja", status: "active", effectiveFrom: "2026-01-01" },
    { id: "fam-ip", code: "IP", name: "Adresy IP", status: "active", effectiveFrom: "2026-01-01" },
  ];
}

export function seedTerms(): ServiceTerm[] {
  return [
    { id: "term-undef", name: "Na czas nieokreślony", termMonths: null, status: "active", effectiveFrom: "2026-01-01" },
    { id: "term-12", name: "12 miesięcy", termMonths: 12, status: "active", effectiveFrom: "2026-01-01" },
    { id: "term-24", name: "24 miesiące", termMonths: 24, status: "active", effectiveFrom: "2026-01-01" },
  ];
}

export function seedPlans(): ServicePlan[] {
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
      month1Price: 69,
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
      month1Price: 39,
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
      month1Price: 10,
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
      month1Price: 12,
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
      month1Price: 20,
    },
  ];
}

export function formatStatus(status: "active" | "archived") {
  return status === "active" ? "Aktywna" : "Archiwalna";
}
