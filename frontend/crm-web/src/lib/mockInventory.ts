"use client";

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
  | "RECEIPT";

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

export type InventoryState = {
  devices: InventoryDevice[];
  modelSummaries: InventoryModelSummary[];
  historyByDeviceId: Record<string, InventoryHistoryEvent[]>;
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

  return { devices, modelSummaries: models, historyByDeviceId };
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

  const after: InventoryDevice = {
    ...before,
    ...patch,
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