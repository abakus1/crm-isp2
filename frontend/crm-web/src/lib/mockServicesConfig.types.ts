export type ServiceStatus = "active" | "archived";

export type ServiceFamily = {
  id: string;
  code: string;
  name: string;
  status: ServiceStatus;
  effectiveFrom: string; // YYYY-MM-DD
};

export type ServiceTerm = {
  id: string;
  months: number | null; // null = nieokreślony
  name: string;
  status: ServiceStatus;
  effectiveFrom: string; // YYYY-MM-DD
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

  // Kanon IP policy (UI-only, provisioning layer later)
  ipPolicy: IpPolicy;
  ipCount?: number; // default 1
};