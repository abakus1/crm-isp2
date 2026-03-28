"use client";

import { assignAddress, getIpamState, unassignAddress } from "@/lib/mockIpam";

// UI-only: Magazyn urządzeń (inventory) – mock store bez backendu.
// Cel: szybki panel dla operatora (przegląd + historia + dokument wejścia).

export type DeviceStatus = "MAGAZYN" | "KLIENT" | "SERWIS" | "WYSŁANY_NAPRAWA";
export type DeviceCondition = "SPRAWNY" | "NIEKOMPLETNY" | "USZKODZONY" | "DO_KASACJI" | "ARCHIWUM";
export type DeviceKind = "ONT" | "STB" | "ATA" | "ROUTER" | "INNY";
export type AcquisitionKind = "KUPIONY" | "WYPOŻYCZONY";

export type InventoryDevice = {
  id: string;
  kind: DeviceKind;
  model: string;
  serialNo: string;
  mac?: string;

  status: DeviceStatus;
  condition: DeviceCondition;

  // meta (UI-only)
  createdAtIso: string;
  updatedAtIso: string;
};

export type InventoryHistoryAction =
  | "CREATE"
  | "EDIT"
  | "STATUS_CHANGE"
  | "CONDITION_CHANGE"
  | "RECEIPT"
  | "ISSUE_TO_SUBSCRIBER"
  | "RETURN_FROM_SUBSCRIBER";

export type InventoryHistoryEvent = {
  id: string;
  deviceId: string;
  atIso: string;
  actor: string; // docelowo staff_user_id
  action: InventoryHistoryAction;
  reason: string;
  before?: Partial<InventoryDevice>;
  after?: Partial<InventoryDevice>;
  meta?: Record<string, any>;
};

export type InventoryModelSummary = {
  id: string;
  kind: DeviceKind;
  model: string;
  minAlarm: number;
};


export type SubscriberDeviceOwnership = "SPRZEDANY" | "WYPOZYCZENIE";

export type SubscriberDeviceAssignment = {
  id: string;
  deviceId: string;
  subscriberId: string;
  ownership: SubscriberDeviceOwnership;
  issuedAtIso: string;
  issuedBy: string;
  issueReason: string;
  issueAddressText?: string;
  issueAddressLocal?: string;
  managementIpAddressId?: string;
  managementIp?: string;
  managementNetworkId?: string;
  managementNetworkCidr?: string;
  returnAtIso?: string;
  returnedBy?: string;
  returnReason?: string;
  returnCondition?: DeviceCondition;
};

export type InventoryReceiptDraft = {
  invoiceNo?: string;
  vendor?: string;
  invoiceDate?: string;
  acquisitionKind: AcquisitionKind;
  kind: DeviceKind;
  model: string;
  unitValuePln?: number;
  items: Array<{ serialNo: string; mac?: string }>;
};

export type OntDeviceTelemetry = {
  deviceId: string;
  serialNo: string;
  enabled: boolean;
  profileName: string;
  signalPowerDbm: string;
  lastDisableReason: string;
  statusLabel: string;
  lastSeenAtIso: string;
};

export type InventoryState = {
  devices: InventoryDevice[];
  modelSummaries: InventoryModelSummary[];
  historyByDeviceId: Record<string, InventoryHistoryEvent[]>;
  subscriberAssignments: SubscriberDeviceAssignment[];
  ontTelemetryByDeviceId: Record<string, OntDeviceTelemetry>;
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

const DEFAULT_ACTOR = "staff:demo";

function pushHistory(
  prev: InventoryState,
  deviceId: string,
  ev: Omit<InventoryHistoryEvent, "id" | "deviceId" | "atIso" | "actor"> & {
    actor?: string;
    atIso?: string;
  }
) {
  const list = prev.historyByDeviceId[deviceId]
    ? [...prev.historyByDeviceId[deviceId]]
    : [];
  const full: InventoryHistoryEvent = {
    id: uid("invhe"),
    deviceId,
    atIso: ev.atIso ?? nowIso(),
    actor: ev.actor ?? DEFAULT_ACTOR,
    action: ev.action,
    reason: ev.reason,
    before: ev.before,
    after: ev.after,
    meta: ev.meta,
  };
  list.unshift(full);
  return { ...prev.historyByDeviceId, [deviceId]: list };
}

function seedState(): InventoryState {
  const baseAt = "2026-02-01T10:00:00.000Z";
  const models: InventoryModelSummary[] = [
    { id: "m-ont-ftech-01", kind: "ONT", model: "FTECH 01", minAlarm: 10 },
    { id: "m-ont-hg8010h", kind: "ONT", model: "Huawei HG8010H", minAlarm: 5 },
    { id: "m-stb-avios-x1", kind: "STB", model: "Avios STB X1", minAlarm: 8 },
    { id: "m-ata-grandstream", kind: "ATA", model: "Grandstream HT802", minAlarm: 3 },
  ];

  const devices: InventoryDevice[] = [
    {
      id: "dev-ont-0001",
      kind: "ONT",
      model: "FTECH 01",
      serialNo: "FTECH01-0001",
      mac: "AA:BB:CC:00:00:01",
      status: "MAGAZYN",
      condition: "SPRAWNY",
      createdAtIso: baseAt,
      updatedAtIso: baseAt,
    },
    {
      id: "dev-ont-0002",
      kind: "ONT",
      model: "FTECH 01",
      serialNo: "FTECH01-0002",
      mac: "AA:BB:CC:00:00:02",
      status: "KLIENT",
      condition: "SPRAWNY",
      createdAtIso: baseAt,
      updatedAtIso: "2026-02-10T12:00:00.000Z",
    },
    {
      id: "dev-stb-0101",
      kind: "STB",
      model: "Avios STB X1",
      serialNo: "AVX1-0101",
      mac: "DE:AD:BE:EF:01:01",
      status: "SERWIS",
      condition: "NIEKOMPLETNY",
      createdAtIso: baseAt,
      updatedAtIso: "2026-02-18T08:30:00.000Z",
    },
    {
      id: "dev-ata-0201",
      kind: "ATA",
      model: "Grandstream HT802",
      serialNo: "GS-HT802-0201",
      mac: "12:34:56:78:90:AB",
      status: "MAGAZYN",
      condition: "SPRAWNY",
      createdAtIso: baseAt,
      updatedAtIso: baseAt,
    },
  ];

  const historyByDeviceId: InventoryState["historyByDeviceId"] = {};
  for (const d of devices) {
    historyByDeviceId[d.id] = [
      {
        id: uid("invhe"),
        deviceId: d.id,
        atIso: d.createdAtIso,
        actor: DEFAULT_ACTOR,
        action: "CREATE",
        reason: "Seed UI (demo)",
        after: { ...d },
      },
    ];
  }

  const subscriberAssignments: SubscriberDeviceAssignment[] = [
    {
      id: uid("sda"),
      deviceId: "dev-ont-0002",
      subscriberId: "sub_0001",
      ownership: "WYPOZYCZENIE",
      issuedAtIso: "2026-02-10T12:00:00.000Z",
      issuedBy: DEFAULT_ACTOR,
      issueReason: "Wydanie ONT do instalacji FTTH",
      issueAddressText: "Kraków, ul. Promienistych 11",
      issueAddressLocal: "4",
      managementIpAddressId: "seed-ip-10-10-0-10",
      managementIp: "10.10.0.10",
      managementNetworkCidr: "10.10.0.0/24",
    },
  ];

  historyByDeviceId["dev-ont-0002"] = [
    {
      id: uid("invhe"),
      deviceId: "dev-ont-0002",
      atIso: "2026-02-10T12:00:00.000Z",
      actor: DEFAULT_ACTOR,
      action: "ISSUE_TO_SUBSCRIBER",
      reason: "Wydanie ONT do abonenta sub_0001",
      before: { status: "MAGAZYN" },
      after: { status: "KLIENT" },
      meta: { subscriberId: "sub_0001", ownership: "WYPOZYCZENIE" },
    },
    ...historyByDeviceId["dev-ont-0002"],
  ];

  const ontTelemetryByDeviceId: Record<string, OntDeviceTelemetry> = {
    "dev-ont-0002": {
      deviceId: "dev-ont-0002",
      serialNo: "FTECH01-0002",
      enabled: true,
      profileName: "FTTH 600/100 Home",
      signalPowerDbm: "-19.6 dBm",
      lastDisableReason: "Brak ostatniego wyłączenia operatora",
      statusLabel: "Włączony",
      lastSeenAtIso: "2026-03-28T16:48:00.000Z",
    },
  };

  return { devices, modelSummaries: models, historyByDeviceId, subscriberAssignments, ontTelemetryByDeviceId };
}

let STATE: InventoryState = seedState();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeInventory(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getInventoryState(): InventoryState {
  return STATE;
}

export function prettyStatus(s: DeviceStatus) {
  if (s === "MAGAZYN") return "magazyn";
  if (s === "KLIENT") return "klient";
  if (s === "SERWIS") return "serwis";
  return "wysłany naprawa";
}

export function prettyCondition(c: DeviceCondition) {
  if (c === "SPRAWNY") return "sprawny";
  if (c === "NIEKOMPLETNY") return "niekompletny";
  if (c === "USZKODZONY") return "uszkodzony";
  if (c === "DO_KASACJI") return "do kasacji";
  return "archiwum";
}

export function prettyKind(k: DeviceKind) {
  if (k === "ONT") return "ONT";
  if (k === "STB") return "STB";
  if (k === "ATA") return "VoIP ATA";
  if (k === "ROUTER") return "Router";
  return "Inny";
}

export function updateModelAlarm(modelId: string, minAlarm: number) {
  STATE = {
    ...STATE,
    modelSummaries: STATE.modelSummaries.map((m) =>
      m.id === modelId ? { ...m, minAlarm: Math.max(0, Math.floor(minAlarm)) } : m
    ),
  };
  emit();
}

export function editDevice(
  deviceId: string,
  patch: Partial<Pick<InventoryDevice, "kind" | "model" | "serialNo" | "mac">>,
  reason: string
) {
  if (!reason?.trim()) throw new Error("Powód jest wymagany");
  const before = STATE.devices.find((d) => d.id === deviceId);
  if (!before) throw new Error("Nie znaleziono urządzenia");

  const nextSerialNo = patch.serialNo?.trim() ?? before.serialNo;
  if (!nextSerialNo) throw new Error("Numer seryjny jest wymagany");

  const after: InventoryDevice = {
    ...before,
    ...patch,
    serialNo: nextSerialNo,
    updatedAtIso: nowIso(),
  };

  let next: InventoryState = {
    ...STATE,
    devices: STATE.devices.map((d) => (d.id === deviceId ? after : d)),
  };
  next = {
    ...next,
    historyByDeviceId: pushHistory(next, deviceId, {
      action: "EDIT",
      reason,
      before,
      after: patch,
    }),
  };
  STATE = next;
  emit();
}

export function changeDeviceStatus(deviceId: string, status: DeviceStatus, reason: string) {
  if (!reason?.trim()) throw new Error("Powód jest wymagany");
  const before = STATE.devices.find((d) => d.id === deviceId);
  if (!before) throw new Error("Nie znaleziono urządzenia");

  const after: InventoryDevice = { ...before, status, updatedAtIso: nowIso() };

  let next: InventoryState = {
    ...STATE,
    devices: STATE.devices.map((d) => (d.id === deviceId ? after : d)),
  };
  next = {
    ...next,
    historyByDeviceId: pushHistory(next, deviceId, {
      action: "STATUS_CHANGE",
      reason,
      before: { status: before.status },
      after: { status },
    }),
  };
  STATE = next;
  emit();
}

export function changeDeviceCondition(deviceId: string, condition: DeviceCondition, reason: string) {
  if (!reason?.trim()) throw new Error("Powód jest wymagany");
  const before = STATE.devices.find((d) => d.id === deviceId);
  if (!before) throw new Error("Nie znaleziono urządzenia");

  const after: InventoryDevice = { ...before, condition, updatedAtIso: nowIso() };
  let next: InventoryState = {
    ...STATE,
    devices: STATE.devices.map((d) => (d.id === deviceId ? after : d)),
  };
  next = {
    ...next,
    historyByDeviceId: pushHistory(next, deviceId, {
      action: "CONDITION_CHANGE",
      reason,
      before: { condition: before.condition },
      after: { condition },
    }),
  };
  STATE = next;
  emit();
}

export function createReceipt(draft: InventoryReceiptDraft, reason: string) {
  if (!reason?.trim()) throw new Error("Powód jest wymagany");
  if (!draft.model?.trim()) throw new Error("Model jest wymagany");
  if (!draft.items || draft.items.length === 0) throw new Error("Dodaj przynajmniej 1 urządzenie");

  const at = nowIso();
  const created: InventoryDevice[] = [];

  for (const it of draft.items) {
    if (!it.serialNo?.trim()) throw new Error("Numer seryjny jest wymagany");
    const device: InventoryDevice = {
      id: uid("dev"),
      kind: draft.kind,
      model: draft.model,
      serialNo: it.serialNo.trim(),
      mac: it.mac?.trim() || undefined,
      status: "MAGAZYN",
      condition: "SPRAWNY",
      createdAtIso: at,
      updatedAtIso: at,
    };
    created.push(device);
  }

  let next: InventoryState = {
    ...STATE,
    devices: [...created, ...STATE.devices],
  };

  // jeżeli model nie istnieje – dodajemy go do podsumowania (alarm domyślny 0)
  const exists = next.modelSummaries.some(
    (m) => m.model.toLowerCase() === draft.model.toLowerCase() && m.kind === draft.kind
  );
  if (!exists) {
    next = {
      ...next,
      modelSummaries: [
        { id: uid("m"), kind: draft.kind, model: draft.model, minAlarm: 0 },
        ...next.modelSummaries,
      ],
    };
  }

  for (const d of created) {
    next = {
      ...next,
      historyByDeviceId: pushHistory(next, d.id, {
        action: "RECEIPT",
        reason,
        after: { ...d },
        meta: {
          invoiceNo: draft.invoiceNo,
          vendor: draft.vendor,
          invoiceDate: draft.invoiceDate,
          acquisitionKind: draft.acquisitionKind,
          unitValuePln: draft.unitValuePln,
        },
      }),
    };
  }

  STATE = next;
  emit();
  return created.map((d) => d.id);
}

export function getDeviceAssignmentsForSubscriber(subscriberId: string) {
  const assignments = STATE.subscriberAssignments
    .filter((row) => row.subscriberId === subscriberId)
    .sort((a, b) => (a.returnAtIso ? 1 : 0) - (b.returnAtIso ? 1 : 0) || b.issuedAtIso.localeCompare(a.issuedAtIso));

  return assignments.map((assignment) => ({
    assignment,
    device: STATE.devices.find((device) => device.id === assignment.deviceId) ?? null,
  }));
}

export function getAvailableDevicesForSubscriberIssue() {
  return STATE.devices
    .filter((device) => device.status === "MAGAZYN" && device.condition !== "ARCHIWUM")
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.model.localeCompare(b.model) || a.serialNo.localeCompare(b.serialNo));
}

export function issueDeviceToSubscriber(args: {
  subscriberId: string;
  deviceId: string;
  ownership: SubscriberDeviceOwnership;
  reason: string;
  issueAddressText: string;
  issueAddressLocal?: string;
  managementIpAddressId: string;
  actor?: string;
}) {
  const reason = args.reason?.trim();
  const issueAddressText = args.issueAddressText?.trim();
  const issueAddressLocal = args.issueAddressLocal?.trim();
  if (!reason) throw new Error("Powód wydania jest wymagany");
  if (!issueAddressText) throw new Error("Adres wydania z PRG jest wymagany");
  if (!args.managementIpAddressId) throw new Error("Adres IP zarządzania jest wymagany");

  const before = STATE.devices.find((device) => device.id === args.deviceId);
  if (!before) throw new Error("Nie znaleziono urządzenia");
  if (before.status !== "MAGAZYN") throw new Error("Wydać do klienta można tylko sprzęt ze statusu MAGAZYN");
  if (before.condition === "ARCHIWUM") throw new Error("Nie można wydać urządzenia w archiwum");

  const activeAssignment = STATE.subscriberAssignments.find((row) => row.deviceId === args.deviceId && !row.returnAtIso);
  if (activeAssignment) throw new Error("Urządzenie jest już przypisane do abonenta");

  const ipam = getIpamState();
  const managementAddress = ipam.addresses.find((row) => row.id === args.managementIpAddressId);
  if (!managementAddress) throw new Error("Nie znaleziono adresu IP zarządzania");
  if (managementAddress.status !== "FREE") throw new Error("Wybrany adres IP zarządzania nie jest już wolny");
  const managementNetwork = ipam.networks.find((row) => row.id === managementAddress.networkId);
  if (!managementNetwork || managementNetwork.poolKind !== "INFRA") throw new Error("Adres IP zarządzania musi pochodzić z sieci INFRA");

  assignAddress(args.managementIpAddressId, {
    customerName: `${args.subscriberId} • ${before.serialNo}`,
    mode: managementNetwork.assignmentMode === "DHCP" ? "DHCP" : "STATIC",
    description: `Management ${before.model} / ${before.serialNo}`,
    mac: before.mac,
  });

  const after: InventoryDevice = { ...before, status: "KLIENT", updatedAtIso: nowIso() };
  const assignment: SubscriberDeviceAssignment = {
    id: uid("sda"),
    deviceId: args.deviceId,
    subscriberId: args.subscriberId,
    ownership: args.ownership,
    issuedAtIso: after.updatedAtIso,
    issuedBy: args.actor ?? DEFAULT_ACTOR,
    issueReason: reason,
    issueAddressText,
    issueAddressLocal: issueAddressLocal || undefined,
    managementIpAddressId: args.managementIpAddressId,
    managementIp: managementAddress.ip,
    managementNetworkId: managementAddress.networkId,
    managementNetworkCidr: managementNetwork.cidr,
  };

  let next: InventoryState = {
    ...STATE,
    devices: STATE.devices.map((device) => (device.id === args.deviceId ? after : device)),
    subscriberAssignments: [assignment, ...STATE.subscriberAssignments],
    ontTelemetryByDeviceId:
      before.kind === "ONT"
        ? {
            ...STATE.ontTelemetryByDeviceId,
            [args.deviceId]: STATE.ontTelemetryByDeviceId[args.deviceId] ?? {
              deviceId: args.deviceId,
              serialNo: before.serialNo,
              enabled: true,
              profileName: "Profil do konfiguracji",
              signalPowerDbm: "brak odczytu",
              lastDisableReason: "Brak",
              statusLabel: "Włączony",
              lastSeenAtIso: nowIso(),
            },
          }
        : STATE.ontTelemetryByDeviceId,
  };
  next = {
    ...next,
    historyByDeviceId: pushHistory(next, args.deviceId, {
      action: "ISSUE_TO_SUBSCRIBER",
      reason,
      actor: assignment.issuedBy,
      before: { status: before.status },
      after: { status: "KLIENT" },
      meta: {
        subscriberId: args.subscriberId,
        ownership: args.ownership,
        issueAddressText,
        issueAddressLocal: issueAddressLocal || undefined,
        managementIp: managementAddress.ip,
      },
    }),
  };

  STATE = next;
  emit();
}

export function returnDeviceFromSubscriber(args: {
  subscriberId: string;
  deviceId: string;
  condition: DeviceCondition;
  reason: string;
  actor?: string;
}) {
  const reason = args.reason?.trim();
  if (!reason) throw new Error("Powód zwrotu jest wymagany");

  const before = STATE.devices.find((device) => device.id === args.deviceId);
  if (!before) throw new Error("Nie znaleziono urządzenia");

  const assignment = STATE.subscriberAssignments.find((row) => row.deviceId === args.deviceId && row.subscriberId === args.subscriberId && !row.returnAtIso);
  if (!assignment) throw new Error("To urządzenie nie jest aktywnie przypisane do tego abonenta");

  if (assignment.managementIpAddressId) {
    unassignAddress(assignment.managementIpAddressId);
  }

  const after: InventoryDevice = {
    ...before,
    status: "MAGAZYN",
    condition: args.condition,
    updatedAtIso: nowIso(),
  };

  const nextTelemetry = { ...STATE.ontTelemetryByDeviceId };
  delete nextTelemetry[args.deviceId];

  let next: InventoryState = {
    ...STATE,
    devices: STATE.devices.map((device) => (device.id === args.deviceId ? after : device)),
    subscriberAssignments: STATE.subscriberAssignments.map((row) =>
      row.id === assignment.id
        ? {
            ...row,
            returnAtIso: after.updatedAtIso,
            returnedBy: args.actor ?? DEFAULT_ACTOR,
            returnReason: reason,
            returnCondition: args.condition,
          }
        : row
    ),
    ontTelemetryByDeviceId: nextTelemetry,
  };
  next = {
    ...next,
    historyByDeviceId: pushHistory(next, args.deviceId, {
      action: "RETURN_FROM_SUBSCRIBER",
      reason,
      actor: args.actor ?? DEFAULT_ACTOR,
      before: { status: before.status, condition: before.condition },
      after: { status: "MAGAZYN", condition: args.condition },
      meta: { subscriberId: args.subscriberId },
    }),
  };

  STATE = next;
  emit();
}


export function getActiveOntsForSubscriber(subscriberId: string) {
  return STATE.subscriberAssignments
    .filter((row) => row.subscriberId === subscriberId && !row.returnAtIso)
    .map((assignment) => {
      const device = STATE.devices.find((row) => row.id === assignment.deviceId && row.kind === "ONT");
      if (!device) return null;
      return {
        assignment,
        device,
        telemetry: STATE.ontTelemetryByDeviceId[device.id] ?? null,
      };
    })
    .filter(Boolean) as Array<{ assignment: SubscriberDeviceAssignment; device: InventoryDevice; telemetry: OntDeviceTelemetry | null }>;
}

export function getActiveOntForSubscriber(subscriberId: string) {
  return getActiveOntsForSubscriber(subscriberId)[0] ?? null;
}
