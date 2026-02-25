"use client";

// Runtime-only seeds (bez TS syntax). Typy są w mockServicesConfig.types.ts.

function uid(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Używamy const-literalów, żeby TS nie degradował "active" -> string
/** @type {const} */
const STATUS_ACTIVE = "active";
/** @type {const} */
const STATUS_ARCHIVED = "archived";

/** @type {const} */
const IP_NONE = "NONE";
/** @type {const} */
const IP_NAT = "NAT_PRIVATE";
/** @type {const} */
const IP_PUBLIC = "PUBLIC";

export function seedFamilies() {
  const d = todayIso();
  return [
    { id: uid("fam"), code: "internet", name: "Internet", status: STATUS_ACTIVE, effectiveFrom: d },
    { id: uid("fam"), code: "tv", name: "Telewizja", status: STATUS_ACTIVE, effectiveFrom: d },
    { id: uid("fam"), code: "infra", name: "Infrastruktura", status: STATUS_ARCHIVED, effectiveFrom: d },
  ];
}

export function seedTerms() {
  const d = todayIso();
  return [
    { id: uid("term"), months: null, name: "Na czas nieokreślony", status: STATUS_ACTIVE, effectiveFrom: d },
    { id: uid("term"), months: 12, name: "12 miesięcy", status: STATUS_ACTIVE, effectiveFrom: d },
    { id: uid("term"), months: 24, name: "24 miesiące", status: STATUS_ACTIVE, effectiveFrom: d },
  ];
}

export function seedPlans() {
  const d = todayIso();
  const families = seedFamilies();
  const terms = seedTerms();

  const famInternet = families.find((f) => f.code === "internet")?.id || families[0].id;
  const famTv = families.find((f) => f.code === "tv")?.id || families[0].id;

  const termIndef = terms.find((t) => t.months === null)?.id || terms[0].id;
  const term12 = terms.find((t) => t.months === 12)?.id || terms[0].id;

  return [
    // Primary
    {
      id: uid("plan"),
      type: "primary",
      familyId: famInternet,
      termId: termIndef,
      name: "Internet 1G",
      status: STATUS_ACTIVE,
      effectiveFrom: d,
      ipPolicy: IP_NAT,
      ipCount: 1,
    },
    {
      id: uid("plan"),
      type: "primary",
      familyId: famTv,
      termId: term12,
      name: "TV Pakiet Start",
      status: STATUS_ACTIVE,
      effectiveFrom: d,
      ipPolicy: IP_NONE,
      ipCount: 1,
    },

    // Addons
    {
      id: uid("plan"),
      type: "addon",
      familyId: famInternet,
      termId: termIndef,
      name: "Publiczny adres IPv4",
      status: STATUS_ACTIVE,
      effectiveFrom: d,
      ipPolicy: IP_PUBLIC,
      ipCount: 1,
    },
    {
      id: uid("plan"),
      type: "addon",
      familyId: famTv,
      termId: term12,
      name: "Dekoder STB (dzierżawa)",
      status: STATUS_ACTIVE,
      effectiveFrom: d,
      ipPolicy: IP_NONE,
      ipCount: 1,
    },
  ];
}

// UI helpers
export function formatStatus(s) {
  return s === "active" ? "Aktywna" : "Archiwalna";
}