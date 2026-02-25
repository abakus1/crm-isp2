"use client";

import type {
  ServiceFamily,
  ServicePlan,
  ServiceTerm,
  ServiceStatus,
  ServicePlanType,
  IpPolicy,
} from "./mockServicesConfig.types";

export type { ServiceFamily, ServicePlan, ServiceTerm, ServiceStatus, ServicePlanType, IpPolicy };

function fillMonthPrices(price: number, months: number): number[] {
  return Array.from({ length: months }, () => price);
}

const STATUS_ACTIVE = "active" as const;
const STATUS_ARCHIVED = "archived" as const;

const IP_NONE = "NONE" as const;
const IP_NAT = "NAT_PRIVATE" as const;
const IP_PUBLIC = "PUBLIC" as const;

// Deterministyczne seed'y (stałe ID) – UI wywołuje seedFamilies/seedTerms/seedPlans osobno,
// więc nie możemy generować losowych ID, bo relacje familyId/termId by się rozjechały.
export function seedFamilies(): ServiceFamily[] {
  return [
    { id: "fam-inet", code: "internet", name: "Internet", status: STATUS_ACTIVE, effectiveFrom: "2026-01-01" },
    { id: "fam-tv", code: "tv", name: "Telewizja", status: STATUS_ACTIVE, effectiveFrom: "2026-01-01" },
    { id: "fam-infra", code: "infra", name: "Infrastruktura", status: STATUS_ARCHIVED, effectiveFrom: "2026-01-01" },
  ];
}

export function seedTerms(): ServiceTerm[] {
  return [
    {
      id: "term-undef",
      name: "Na czas nieokreślony",
      termMonths: null,
      status: STATUS_ACTIVE,
      effectiveFrom: "2026-01-01",
      saleFrom: "2026-01-01",
      saleTo: null,
    },
    {
      id: "term-12",
      name: "12 miesięcy",
      termMonths: 12,
      status: STATUS_ACTIVE,
      effectiveFrom: "2026-01-01",
      saleFrom: "2026-01-01",
      saleTo: null,
    },
    {
      id: "term-24",
      name: "24 miesiące",
      termMonths: 24,
      status: STATUS_ACTIVE,
      effectiveFrom: "2026-01-01",
      saleFrom: "2026-01-01",
      saleTo: null,
    },
  ];
}

export function seedPlans(): ServicePlan[] {
  // UI pokazuje np. 24 pola, jeśli termMonths = null (bezterminowa)
  const uiDefaultMonths = 24;

  return [
    // PRIMARY
    {
      id: "plan-inet-1g-undef",
      type: "primary",
      familyId: "fam-inet",
      termId: "term-undef",
      name: "Internet 1G",
      billingProductCode: "INTERNET_1G",
      status: STATUS_ACTIVE,
      subscribersCount: 120,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(99, uiDefaultMonths),
      activationFee: 1,
      ipPolicy: IP_NAT,
      ipCount: 1,
      downloadBps: 1_000_000_000,
      uploadBps: 300_000_000,
      saleFrom: "2026-01-01",
      saleTo: null,
      requiredAddonPlanIds: ["plan-addon-ont"],
      optionalAddonPlanIds: ["plan-addon-ip-public"],
    },
    {
      id: "plan-inet-biz-600-24",
      type: "primary",
      familyId: "fam-inet",
      termId: "term-24",
      name: "Internet Biz 600 + Public IP",
      billingProductCode: "INTERNET_BIZ_600",
      status: STATUS_ACTIVE,
      subscribersCount: 12,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(159, 24),
      activationFee: 0,
      ipPolicy: IP_PUBLIC,
      ipCount: 1,
      downloadBps: 600_000_000,
      uploadBps: 100_000_000,
      saleFrom: "2026-01-01",
      saleTo: null,
      requiredAddonPlanIds: ["plan-addon-ont"],
      optionalAddonPlanIds: [],
    },
    {
      id: "plan-tv-max-12",
      type: "primary",
      familyId: "fam-tv",
      termId: "term-12",
      name: "TV Max",
      billingProductCode: "TV_MAX",
      status: STATUS_ACTIVE,
      subscribersCount: 45,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(59, 12),
      activationFee: 0,
      ipPolicy: IP_NONE,
      saleFrom: "2026-01-01",
      saleTo: null,
      requiredAddonPlanIds: ["plan-addon-stb"],
      optionalAddonPlanIds: [],
    },

    // ADDONS
    {
      id: "plan-addon-ont",
      type: "addon",
      familyId: "fam-inet",
      termId: "term-undef",
      name: "ONT dzierżawa",
      billingProductCode: "ONT_RENT",
      status: STATUS_ACTIVE,
      subscribersCount: 500,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(10, uiDefaultMonths),
      activationFee: 0,
      ipPolicy: IP_NONE,
      saleFrom: "2026-01-01",
      saleTo: null,
    },
    {
      id: "plan-addon-ip-public",
      type: "addon",
      familyId: "fam-inet",
      termId: "term-undef",
      name: "Publiczne IPv4",
      billingProductCode: "IPV4_PUBLIC",
      status: STATUS_ACTIVE,
      subscribersCount: 80,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(20, uiDefaultMonths),
      activationFee: 0,
      ipPolicy: IP_PUBLIC,
      ipCount: 1,
      saleFrom: "2026-01-01",
      saleTo: null,
    },
    {
      id: "plan-addon-stb",
      type: "addon",
      familyId: "fam-tv",
      termId: "term-undef",
      name: "STB dzierżawa",
      billingProductCode: "STB_RENT",
      status: STATUS_ACTIVE,
      subscribersCount: 260,
      effectiveFrom: "2026-01-01",
      monthPrices: fillMonthPrices(8, uiDefaultMonths),
      activationFee: 0,
      ipPolicy: IP_NONE,
      saleFrom: "2026-01-01",
      saleTo: null,
    },
  ];
}

export function formatStatus(status: ServiceStatus): string {
  return status === "active" ? "Aktywny" : "Archiwalny";
}