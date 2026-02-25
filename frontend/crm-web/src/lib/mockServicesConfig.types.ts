export type ServiceStatus = "active" | "archived";

export type ServiceFamily = {
  id: string;
  code: string;
  name: string;
  status: ServiceStatus;
  effectiveFrom: string; // YYYY-MM-DD
};

// UI expects termMonths + sale window (saleFrom/saleTo)
export type ServiceTerm = {
  id: string;
  name: string;
  termMonths: number | null; // null = nieokreślony
  status: ServiceStatus;
  effectiveFrom: string; // YYYY-MM-DD
  saleFrom?: string;
  saleTo?: string | null;
};

export type ServicePlanType = "primary" | "addon";
export type IpPolicy = "NONE" | "NAT_PRIVATE" | "PUBLIC";

export type ServicePlan = {
  id: string;
  type: ServicePlanType;
  familyId: string;
  termId: string;
  name: string;
  status: ServiceStatus;
  effectiveFrom: string; // YYYY-MM-DD

  // Used by UI (addons lock + list views)
  subscribersCount?: number;

  // Billing / pricing UI (mock)
  billingProductCode?: string;
  monthPrices?: number[]; // M1..Mx
  activationFee?: number;

  // Sale window for plan
  saleFrom?: string;
  saleTo?: string | null;

  // Dependencies (primary -> addon)
  requiredAddonPlanIds?: string[];
  optionalAddonPlanIds?: string[];

  // IP policy (UI-only, provisioning layer later)
  ipPolicy?: IpPolicy;
  ipCount?: number; // default 1
};
