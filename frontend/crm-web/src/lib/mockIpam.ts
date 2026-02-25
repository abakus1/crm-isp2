"use client";

// UI-only: Magazyn IP (mini-IPAM) – mock store bez backendu.
// Zasada: jedna sieć (CIDR) generuje pojedyncze adresy IP (usable) z dziedziczeniem gateway/DNS.
//
// KANON (operatorski):
// Sieć (Network) ma:
// - poolKind: CUSTOMER_NAT / CUSTOMER_PUBLIC / INFRA
// - assignmentMode: DHCP / PPPOE / STATIC
//
// Adresy dziedziczą gateway/DNS z sieci, a provisioning w przyszłości bierze assignmentMode z sieci jako źródło prawdy.

export type IpPoolKind = "CUSTOMER_NAT" | "CUSTOMER_PUBLIC" | "INFRA";
export type IpAssignmentMode = "DHCP" | "PPPOE" | "STATIC";

export type IpAddressMode = "DHCP" | "PPPOE" | "STATIC";
export type IpAddressStatus = "FREE" | "ASSIGNED" | "RESERVED";

export type IpNetwork = {
  id: string;
  cidr: string; // np. 192.0.2.0/29
  poolKind: IpPoolKind;
  assignmentMode: IpAssignmentMode;
  description: string;
  gateway: string;
  dns1: string;
  dns2: string;
  broadcast: string;
  createdAtIso: string;
};

export type IpAddress = {
  id: string;
  ip: string;
  networkId: string;
  description: string;
  status: IpAddressStatus;

  // dziedziczone (z sieci) – w UI pokazujemy, ale nie edytujemy na poziomie adresu
  gateway: string;
  dns1: string;
  dns2: string;

  // przypisanie (UI-only)
  // Uwaga: w kanonie tryb provisioning wynika z network.assignmentMode,
  // ale dla UI zostawiamy `mode` (czasem przydaje się w mocku).
  mode?: IpAddressMode;
  customerName?: string;
  assignedAtIso?: string;
  expiresAtIso?: string;

  // PPPOE
  pppoeLogin?: string;
  pppoePassword?: string;

  // DHCP
  mac?: string;
};

export type IpAddressHistoryAction =
  | "ASSIGN"
  | "UNASSIGN"
  | "BLOCK"
  | "UNBLOCK"
  | "RESERVE"
  | "UNRESERVE"
  | "EDIT";

export type IpAddressHistoryEvent = {
  id: string;
  addrId: string;
  atIso: string;
  action: IpAddressHistoryAction;
  actor: string; // UI-only (docelowo staff_user)
  note?: string;
  before?: Partial<IpAddress>;
  after?: Partial<IpAddress>;
};

export type IpamState = {
  networks: IpNetwork[];
  addresses: IpAddress[];
  addressHistory: Record<string, IpAddressHistoryEvent[]>;
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_ACTOR = "staff:demo";

function nowIso() {
  return new Date().toISOString();
}

function pushHistory(
  prev: IpamState,
  addrId: string,
  ev: Omit<IpAddressHistoryEvent, "id" | "addrId" | "atIso" | "actor"> & { actor?: string; atIso?: string }
) {
  const list = prev.addressHistory[addrId] ? [...prev.addressHistory[addrId]] : [];
  const full: IpAddressHistoryEvent = {
    id: uid("iphe"),
    addrId,
    atIso: ev.atIso ?? nowIso(),
    action: ev.action,
    actor: ev.actor ?? DEFAULT_ACTOR,
    note: ev.note,
    before: ev.before,
    after: ev.after,
  };
  list.unshift(full);
  return { ...prev.addressHistory, [addrId]: list };
}

// ---------- IP math (IPv4) ----------

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function ipToInt(ip: string): number {
  const parts = ip.trim().split(".").map((p) => Number(p));
  assert(parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255), `Niepoprawny IP: ${ip}`);
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function intToIp(n: number): string {
  const a = (n >>> 24) & 255;
  const b = (n >>> 16) & 255;
  const c = (n >>> 8) & 255;
  const d = n & 255;
  return `${a}.${b}.${c}.${d}`;
}

export function parseCidr(cidr: string): { baseIp: string; prefix: number } {
  const [ip, pfx] = cidr.trim().split("/");
  assert(ip && pfx, `Niepoprawny CIDR: ${cidr}`);
  const prefix = Number(pfx);
  assert(Number.isInteger(prefix) && prefix >= 0 && prefix <= 32, `Niepoprawny prefix: /${pfx}`);
  ipToInt(ip);
  return { baseIp: ip, prefix };
}

export function networkInfo(cidr: string): {
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  total: number;
  usable: number;
} {
  const { baseIp, prefix } = parseCidr(cidr);
  const base = ipToInt(baseIp);
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  const net = (base & mask) >>> 0;
  const bc = (net | (~mask >>> 0)) >>> 0;
  const total = prefix === 32 ? 1 : Math.pow(2, 32 - prefix);

  // RFC: /31 ma 2 usable (p2p). /32 ma 1. Reszta: -2 (network+broadcast)
  const usable = prefix === 32 ? 1 : prefix === 31 ? 2 : Math.max(total - 2, 0);

  const first = prefix >= 31 ? net : (net + 1) >>> 0;
  const last = prefix >= 31 ? bc : (bc - 1) >>> 0;
  return {
    network: intToIp(net),
    broadcast: intToIp(bc),
    firstHost: intToIp(first),
    lastHost: intToIp(last),
    total,
    usable,
  };
}

export function generateUsableIps(cidr: string): string[] {
  const { prefix } = parseCidr(cidr);
  const info = networkInfo(cidr);
  const first = ipToInt(info.firstHost);
  const last = ipToInt(info.lastHost);
  const out: string[] = [];

  for (let n = first; n <= last; n++) out.push(intToIp(n >>> 0));
  if (prefix <= 30) {
    assert(out.length === info.usable, `Błąd generatora IP: oczekiwano ${info.usable}, jest ${out.length}`);
  }
  return out;
}

export function splitCidr(parentCidr: string, childPrefix: number): string[] {
  const { prefix: parentPrefix } = parseCidr(parentCidr);
  assert(childPrefix > parentPrefix && childPrefix <= 32, "Nowy prefix musi być większy (bardziej szczegółowy) i <= /32");
  const parent = networkInfo(parentCidr);
  const parentNet = ipToInt(parent.network);

  const parentSize = parentPrefix === 32 ? 1 : Math.pow(2, 32 - parentPrefix);
  const childSize = childPrefix === 32 ? 1 : Math.pow(2, 32 - childPrefix);
  assert(parentSize % childSize === 0, "Ten podział nie jest równy (CIDR size mismatch)");

  const count = parentSize / childSize;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(`${intToIp((parentNet + i * childSize) >>> 0)}/${childPrefix}`);
  return out;
}

// ---------- Store ----------

type Listener = () => void;

function seedState(): IpamState {
  const now = todayIso();

  const n1: IpNetwork = {
    id: uid("net"),
    cidr: "192.0.2.0/29",
    poolKind: "CUSTOMER_PUBLIC",
    assignmentMode: "PPPOE",
    description: "Public IP (klienci) – demo",
    gateway: "192.0.2.1",
    dns1: "1.1.1.1",
    dns2: "8.8.8.8",
    broadcast: networkInfo("192.0.2.0/29").broadcast,
    createdAtIso: now,
  };

  const n2: IpNetwork = {
    id: uid("net"),
    cidr: "10.10.0.0/24",
    poolKind: "INFRA",
    assignmentMode: "STATIC",
    description: "Management (infra) – demo",
    gateway: "10.10.0.1",
    dns1: "10.10.0.1",
    dns2: "1.1.1.1",
    broadcast: networkInfo("10.10.0.0/24").broadcast,
    createdAtIso: now,
  };

  const addrsFrom = (net: IpNetwork) =>
    generateUsableIps(net.cidr).map<IpAddress>((ip) => ({
      id: uid("ip"),
      ip,
      networkId: net.id,
      description: "",
      status: "FREE",
      gateway: net.gateway,
      dns1: net.dns1,
      dns2: net.dns2,
    }));

  const a1 = addrsFrom(n1);
  const a2 = addrsFrom(n2);

  if (a1.length > 0) {
    a1[0] = {
      ...a1[0],
      description: "IP do Internet PRO",
      status: "ASSIGNED",
      // UI-only: zostawiamy mode jako hint (docelowo effective = n1.assignmentMode)
      mode: "PPPOE",
      customerName: "Jan Kowalski",
      assignedAtIso: now,
      expiresAtIso: "",
      pppoeLogin: "jkowalski-001",
      pppoePassword: "demo-demo-demo",
    };
  }

  return {
    networks: [n1, n2],
    addresses: [...a1, ...a2],
    addressHistory: {},
  };
}

function getGlobal(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return globalThis as any;
}

function ensureStore() {
  const g = getGlobal();
  if (!g.__CRM_IPAM_STORE__) {
    g.__CRM_IPAM_STORE__ = {
      state: seedState() as IpamState,
      listeners: new Set<Listener>(),
    };
  }
  return g.__CRM_IPAM_STORE__ as { state: IpamState; listeners: Set<Listener> };
}

export function getIpamState(): IpamState {
  return ensureStore().state;
}

export function setIpamState(updater: (prev: IpamState) => IpamState) {
  const store = ensureStore();
  store.state = updater(store.state);
  for (const l of store.listeners) l();
}

export function subscribeIpam(listener: Listener) {
  const store = ensureStore();
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

// ---------- Operations ----------

export function createNetwork(input: {
  cidr: string;
  poolKind: IpPoolKind;
  assignmentMode: IpAssignmentMode;
  description: string;
  gateway: string;
  dns1: string;
  dns2: string;
}): { network: IpNetwork; addresses: IpAddress[] } {
  const now = todayIso();
  const info = networkInfo(input.cidr);
  const network: IpNetwork = {
    id: uid("net"),
    cidr: input.cidr.trim(),
    poolKind: input.poolKind,
    assignmentMode: input.assignmentMode,
    description: input.description.trim(),
    gateway: input.gateway.trim(),
    dns1: input.dns1.trim(),
    dns2: input.dns2.trim(),
    broadcast: info.broadcast,
    createdAtIso: now,
  };
  const addresses = generateUsableIps(network.cidr).map<IpAddress>((ip) => ({
    id: uid("ip"),
    ip,
    networkId: network.id,
    description: "",
    status: "FREE",
    gateway: network.gateway,
    dns1: network.dns1,
    dns2: network.dns2,
  }));
  return { network, addresses };
}

export function updateNetwork(
  networkId: string,
  patch: Partial<Omit<IpNetwork, "id" | "cidr" | "broadcast" | "createdAtIso">>
) {
  setIpamState((prev) => {
    const networks = prev.networks.map((n) => (n.id === networkId ? { ...n, ...patch } : n));
    const net = networks.find((n) => n.id === networkId);
    const addresses = net
      ? prev.addresses.map((a) =>
          a.networkId === networkId ? { ...a, gateway: net.gateway, dns1: net.dns1, dns2: net.dns2 } : a
        )
      : prev.addresses;
    return { ...prev, networks, addresses };
  });
}

export function deleteNetwork(networkId: string) {
  setIpamState((prev) => ({
    ...prev,
    networks: prev.networks.filter((n) => n.id !== networkId),
    addresses: prev.addresses.filter((a) => a.networkId !== networkId),
    // addressHistory zostaje; ewentualnie później możemy czyścić eventy adresów tej sieci
  }));
}

export function splitNetwork(networkId: string, childPrefix: number) {
  setIpamState((prev) => {
    const parent = prev.networks.find((n) => n.id === networkId);
    if (!parent) return prev;

    const inParent = prev.addresses.filter((a) => a.networkId === networkId);
    const hasUsed = inParent.some((a) => a.status !== "FREE");
    if (hasUsed) {
      throw new Error("Nie można dzielić sieci z wykorzystanymi adresami (tylko FREE).");
    }

    const childCidrs = splitCidr(parent.cidr, childPrefix);
    const createdAtIso = todayIso();

    const created = childCidrs.map((cidr) => {
      const network: IpNetwork = {
        id: uid("net"),
        cidr,
        poolKind: parent.poolKind,
        assignmentMode: parent.assignmentMode,
        description: parent.description,
        gateway: parent.gateway,
        dns1: parent.dns1,
        dns2: parent.dns2,
        broadcast: networkInfo(cidr).broadcast,
        createdAtIso,
      };

      const addresses = generateUsableIps(network.cidr).map<IpAddress>((ip) => ({
        id: uid("ip"),
        ip,
        networkId: network.id,
        description: "",
        status: "FREE",
        gateway: network.gateway,
        dns1: network.dns1,
        dns2: network.dns2,
      }));

      return { network, addresses };
    });

    return {
      ...prev,
      networks: [...prev.networks.filter((n) => n.id !== networkId), ...created.map((c) => c.network)],
      addresses: [...prev.addresses.filter((a) => a.networkId !== networkId), ...created.flatMap((c) => c.addresses)],
    };
  });
}

export function assignAddress(
  addrId: string,
  input: {
    customerName: string;
    mode: IpAddressMode;
    expiresAtIso?: string;
    description?: string;
    // optional overrides
    pppoeLogin?: string;
    pppoePassword?: string;
    mac?: string;
  }
) {
  const now = todayIso();
  setIpamState((prev) => {
    const addresses: IpAddress[] = prev.addresses.map((a): IpAddress => {
      if (a.id !== addrId) return a;

      const customer = input.customerName.trim();

      const base: IpAddress = {
        ...a,
        status: "ASSIGNED",
        customerName: customer,
        mode: input.mode,
        assignedAtIso: now,
        expiresAtIso: (input.expiresAtIso ?? "").trim(),
        description: (input.description ?? a.description).trim(),
        mac: undefined,
        pppoeLogin: undefined,
        pppoePassword: undefined,
      };

      if (input.mode === "DHCP") {
        return { ...base, mac: (input.mac ?? "").trim() };
      }

      if (input.mode === "PPPOE") {
        // FIX: używamy pewnej zmiennej `customer`, zamiast base.customerName (bo typ w IpAddress to string | undefined)
        const fallbackLogin = `${customer
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9\-]/g, "")
          .slice(0, 20)}-${base.ip.split(".").pop()}`;

        const fallbackPass = Math.random().toString(36).slice(2, 10) + "-" + Math.random().toString(36).slice(2, 10);

        return {
          ...base,
          pppoeLogin: (input.pppoeLogin ?? fallbackLogin).trim(),
          pppoePassword: (input.pppoePassword ?? fallbackPass).trim(),
        };
      }

      return base; // STATIC
    });

    const before = prev.addresses.find((x) => x.id === addrId);
    const after = addresses.find((x) => x.id === addrId);
    const addressHistory = pushHistory(prev, addrId, {
      action: "ASSIGN",
      note: `mode=${after?.mode ?? ""}`,
      before: before
        ? {
            status: before.status,
            mode: before.mode,
            customerName: before.customerName,
            description: before.description,
            mac: before.mac,
            pppoeLogin: before.pppoeLogin,
            expiresAtIso: before.expiresAtIso,
          }
        : undefined,
      after: after
        ? {
            status: after.status,
            mode: after.mode,
            customerName: after.customerName,
            description: after.description,
            mac: after.mac,
            pppoeLogin: after.pppoeLogin,
            expiresAtIso: after.expiresAtIso,
          }
        : undefined,
    });
    return { ...prev, addresses, addressHistory };
  });
}

export function unassignAddress(addrId: string) {
  setIpamState((prev) => {
    const before = prev.addresses.find((x) => x.id === addrId);
    const addresses: IpAddress[] = prev.addresses.map((a): IpAddress =>
      a.id === addrId
        ? {
            ...a,
            status: "FREE",
            // UI-only: po zwolnieniu czyścimy dane przypisania (włącznie z opisem adresu),
            // bo opis jest częścią "przydziału", a nie stałą cechą puli.
            description: "",
            customerName: undefined,
            assignedAtIso: undefined,
            expiresAtIso: undefined,
            mode: undefined,
            mac: undefined,
            pppoeLogin: undefined,
            pppoePassword: undefined,
          }
        : a
    );

    const after = addresses.find((x) => x.id === addrId);

    const addressHistory = pushHistory(prev, addrId, {
      action: "UNASSIGN",
      before: before
        ? {
            status: before.status,
            mode: before.mode,
            customerName: before.customerName,
            description: before.description,
            mac: before.mac,
            pppoeLogin: before.pppoeLogin,
            expiresAtIso: before.expiresAtIso,
          }
        : undefined,
      after: after
        ? {
            status: after.status,
            mode: after.mode,
            customerName: after.customerName,
            description: after.description,
          }
        : undefined,
    });

    return { ...prev, addresses, addressHistory };
  });
}

export function getAddressHistory(addrId: string): IpAddressHistoryEvent[] {
  const s = getIpamState();
  return s.addressHistory[addrId] ?? [];
}