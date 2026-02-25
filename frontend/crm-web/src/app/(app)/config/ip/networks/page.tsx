"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import { SimpleModal } from "@/components/SimpleModal";
import {
  createNetwork,
  deleteNetwork,
  getIpamState,
  IpNetwork,
  IpNetworkType,
  IpNetworkUsage,
  networkInfo,
  setIpamState,
  splitNetwork,
  subscribeIpam,
  updateNetwork,
} from "@/lib/mockIpam";

function useIpam() {
  return useSyncExternalStore(subscribeIpam, getIpamState, getIpamState);
}

function Badge({ children }: { children: string }) {
  return <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">{children}</span>;
}

function pct(n: number, d: number) {
  if (!d) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

export default function IpNetworksPage() {
  const ipam = useIpam();

  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState<"all" | IpNetworkType>("all");
  const [filterUsage, setFilterUsage] = useState<"all" | IpNetworkUsage>("all");

  const freeByNetwork = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ipam.addresses) {
      if (a.status === "FREE") m.set(a.networkId, (m.get(a.networkId) ?? 0) + 1);
    }
    return m;
  }, [ipam.addresses]);

  const totalByNetwork = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ipam.addresses) m.set(a.networkId, (m.get(a.networkId) ?? 0) + 1);
    return m;
  }, [ipam.addresses]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ipam.networks
      .filter((n) => (filterType === "all" ? true : n.type === filterType))
      .filter((n) => (filterUsage === "all" ? true : n.usage === filterUsage))
      .filter((n) => {
        if (!needle) return true;
        return (
          (n.cidr + " " + n.description + " " + n.gateway + " " + n.dns1 + " " + n.dns2)
            .toLowerCase()
            .includes(needle)
        );
      })
      .sort((a, b) => a.cidr.localeCompare(b.cidr));
  }, [ipam.networks, q, filterType, filterUsage]);

  // ---------- Add/Edit modal ----------
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<"new" | "edit">("new");
  const [editId, setEditId] = useState<string | null>(null);

  const [cidr, setCidr] = useState("192.0.2.0/29");
  const [type, setType] = useState<IpNetworkType>("PUBLIC");
  const [usage, setUsage] = useState<IpNetworkUsage>("CLIENT");
  const [desc, setDesc] = useState("");
  const [gateway, setGateway] = useState("");
  const [dns1, setDns1] = useState("1.1.1.1");
  const [dns2, setDns2] = useState("8.8.8.8");
  const [err, setErr] = useState<string | null>(null);

  function openNew() {
    setEditMode("new");
    setEditId(null);
    setCidr("192.0.2.0/29");
    setType("PUBLIC");
    setUsage("CLIENT");
    setDesc("");
    setGateway("");
    setDns1("1.1.1.1");
    setDns2("8.8.8.8");
    setErr(null);
    setEditOpen(true);
  }

  function openEdit(n: IpNetwork) {
    setEditMode("edit");
    setEditId(n.id);
    setCidr(n.cidr);
    setType(n.type);
    setUsage(n.usage);
    setDesc(n.description);
    setGateway(n.gateway);
    setDns1(n.dns1);
    setDns2(n.dns2);
    setErr(null);
    setEditOpen(true);
  }

  function doSave() {
    try {
      setErr(null);
      // sanity: sprawdź CIDR
      const info = networkInfo(cidr);
      if (!gateway.trim()) throw new Error("Gateway jest wymagany");
      if (!dns1.trim()) throw new Error("DNS 1 jest wymagany");
      if (!dns2.trim()) throw new Error("DNS 2 jest wymagany");

      if (editMode === "new") {
        const created = createNetwork({
          cidr,
          type,
          usage,
          description: desc,
          gateway,
          dns1,
          dns2,
        });
        // zapis do store
        const { network, addresses } = created;
        const existingCidrs = new Set(ipam.networks.map((x) => x.cidr));
        if (existingCidrs.has(network.cidr)) throw new Error("Taka sieć CIDR już istnieje");
        // broadcast liczy się automatycznie, ale info zostawiamy w labelce
        void info;
        setIpamState((prev) => ({
        ...prev,
        networks: [...prev.networks, network],
        addresses: [...prev.addresses, ...addresses],
      }));
      } else if (editId) {
        updateNetwork(editId, {
          type,
          usage,
          description: desc,
          gateway,
          dns1,
          dns2,
        });
      }
      setEditOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Błąd zapisu");
    }
  }

  // ---------- Split modal ----------
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [splitPrefix, setSplitPrefix] = useState(25);
  const [splitErr, setSplitErr] = useState<string | null>(null);

  function openSplit(n: IpNetwork) {
    const p = Number(n.cidr.split("/")[1] ?? 24);
    setSplitId(n.id);
    setSplitPrefix(Math.min(32, p + 1));
    setSplitErr(null);
    setSplitOpen(true);
  }

  function doSplit() {
    try {
      if (!splitId) return;
      setSplitErr(null);
      splitNetwork(splitId, splitPrefix);
      setSplitOpen(false);
    } catch (e: any) {
      setSplitErr(e?.message ?? "Błąd podziału");
    }
  }

  // ---------- Delete modal ----------
  const [delOpen, setDelOpen] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);

  function openDelete(n: IpNetwork) {
    setDelId(n.id);
    setDelErr(null);
    setDelOpen(true);
  }

  function doDelete() {
    try {
      if (!delId) return;
      const used = ipam.addresses.some((a) => a.networkId === delId && a.status !== "FREE");
      if (used) throw new Error("Nie można usunąć sieci, która ma przydzielone adresy. Najpierw zwolnij IP.");
      deleteNetwork(delId);
      setDelOpen(false);
    } catch (e: any) {
      setDelErr(e?.message ?? "Błąd usuwania");
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Konfiguracja → Magazyn IP → Sieci IP</div>
          <div className="text-xs text-muted-foreground">
            Dodajesz CIDR, ustawiasz gateway/DNS, a system generuje usable IP do magazynu. Sieć ma typ (Public/Private)
            i przeznaczenie (Kliencka vs Gemini).
          </div>
        </div>
        <Link className="text-sm underline" href="/config/ip">
          Wróć
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Szukaj</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="np. 10.10 / public / dns"
            className="mt-1 rounded-md border px-3 py-2 text-sm w-72"
          />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Typ</div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="mt-1 rounded-md border px-3 py-2 text-sm"
          >
            <option value="all">Wszystkie</option>
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Przeznaczenie</div>
          <select
            value={filterUsage}
            onChange={(e) => setFilterUsage(e.target.value as any)}
            className="mt-1 rounded-md border px-3 py-2 text-sm"
          >
            <option value="all">Wszystkie</option>
            <option value="CLIENT">Kliencka</option>
            <option value="GEMINI">Urządzenia Gemini</option>
          </select>
        </div>

        <button className="ml-auto px-3 py-2 rounded-md bg-primary text-primary-foreground" onClick={openNew}>
          + Dodaj sieć
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-3 text-left">CIDR</th>
              <th className="p-3 text-left">Opis</th>
              <th className="p-3 text-left">Typ</th>
              <th className="p-3 text-left">Przeznaczenie</th>
              <th className="p-3 text-left">Gateway</th>
              <th className="p-3 text-left">DNS</th>
              <th className="p-3 text-right">Wolne</th>
              <th className="p-3 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {view.map((n) => {
              const free = freeByNetwork.get(n.id) ?? 0;
              const total = totalByNetwork.get(n.id) ?? 0;
              const used = total - free;
              const info = networkInfo(n.cidr);
              return (
                <tr key={n.id} className="border-t">
                  <td className="p-3">
                    <div className="font-mono text-xs">{n.cidr}</div>
                    <div className="text-xs text-muted-foreground">broadcast: {n.broadcast}</div>
                    <div className="text-xs text-muted-foreground">hosty: {info.usable}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{n.description || "–"}</div>
                    <div className="text-xs text-muted-foreground">utw.: {n.createdAtIso}</div>
                  </td>
                  <td className="p-3">
                    <Badge>{n.type}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge>{n.usage === "CLIENT" ? "CLIENT" : "GEMINI"}</Badge>
                  </td>
                  <td className="p-3 font-mono text-xs">{n.gateway}</td>
                  <td className="p-3">
                    <div className="font-mono text-xs">{n.dns1}</div>
                    <div className="font-mono text-xs text-muted-foreground">{n.dns2}</div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-semibold">
                      {free}/{total}
                    </div>
                    <div className="text-xs text-muted-foreground">użyte: {used} ({pct(used, total)})</div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-2">
                      <button className="px-3 py-1.5 rounded-md border" onClick={() => openEdit(n)}>
                        Edytuj
                      </button>
                      <button className="px-3 py-1.5 rounded-md border" onClick={() => openSplit(n)}>
                        Podziel
                      </button>
                      <button className="px-3 py-1.5 rounded-md border" onClick={() => openDelete(n)}>
                        Usuń
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {view.length === 0 && (
              <tr>
                <td className="p-6 text-sm text-muted-foreground" colSpan={8}>
                  Brak wyników.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ADD/EDIT */}
      <SimpleModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editMode === "new" ? "Dodaj sieć" : "Edytuj sieć"}
        description="Dodanie sieci generuje usable adresy IP w magazynie. Broadcast liczy się automatycznie."
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {(() => {
                try {
                  const i = networkInfo(cidr);
                  return `broadcast: ${i.broadcast} • usable: ${i.usable}`;
                } catch {
                  return "CIDR niepoprawny";
                }
              })()}
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded-md border" onClick={() => setEditOpen(false)}>
                Anuluj
              </button>
              <button className="px-3 py-2 rounded-md bg-primary text-primary-foreground" onClick={doSave}>
                Zapisz
              </button>
            </div>
          </div>
        }
      >
        {err ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{err}</div> : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">CIDR</div>
            <input
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
              disabled={editMode === "edit"}
              className="mt-1 rounded-md border px-3 py-2 text-sm w-full disabled:opacity-60"
              placeholder="np. 203.0.113.0/28"
            />
            {editMode === "edit" ? (
              <div className="text-xs text-muted-foreground mt-1">CIDR jest zablokowany w edycji (żeby nie mieszać magazynu).</div>
            ) : null}
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Opis</div>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="mt-1 rounded-md border px-3 py-2 text-sm w-full"
              placeholder="np. Public IP (Internet PRO)"
            />
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Typ</div>
            <select value={type} onChange={(e) => setType(e.target.value as any)} className="mt-1 rounded-md border px-3 py-2 text-sm w-full">
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private (NAT/management)</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Przeznaczenie</div>
            <select
              value={usage}
              onChange={(e) => setUsage(e.target.value as any)}
              className="mt-1 rounded-md border px-3 py-2 text-sm w-full"
            >
              <option value="CLIENT">Kliencka</option>
              <option value="GEMINI">Urządzenia Gemini</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Gateway</div>
            <input
              value={gateway}
              onChange={(e) => setGateway(e.target.value)}
              className="mt-1 rounded-md border px-3 py-2 text-sm w-full"
              placeholder="np. 203.0.113.1"
            />
          </div>

          <div>
            <div className="text-xs text-muted-foreground">DNS 1</div>
            <input value={dns1} onChange={(e) => setDns1(e.target.value)} className="mt-1 rounded-md border px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">DNS 2</div>
            <input value={dns2} onChange={(e) => setDns2(e.target.value)} className="mt-1 rounded-md border px-3 py-2 text-sm w-full" />
          </div>
        </div>
      </SimpleModal>

      {/* SPLIT */}
      <SimpleModal
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        title="Podziel sieć"
        description="Podział jest dozwolony tylko jeśli wszystkie adresy w sieci są FREE."
        footer={
          <div className="flex items-center justify-end gap-2">
            <button className="px-3 py-2 rounded-md border" onClick={() => setSplitOpen(false)}>
              Anuluj
            </button>
            <button className="px-3 py-2 rounded-md bg-primary text-primary-foreground" onClick={doSplit}>
              Podziel
            </button>
          </div>
        }
      >
        {splitErr ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{splitErr}</div> : null}
        <div>
          <div className="text-xs text-muted-foreground">Nowy prefix</div>
          <input
            type="number"
            min={1}
            max={32}
            value={splitPrefix}
            onChange={(e) => setSplitPrefix(Number(e.target.value))}
            className="mt-1 rounded-md border px-3 py-2 text-sm w-40"
          />
          <div className="text-xs text-muted-foreground mt-2">
            Przykład: /24 → /25 (2 sieci), /24 → /26 (4 sieci). To jest czysty CIDR split.
          </div>
        </div>
      </SimpleModal>

      {/* DELETE */}
      <SimpleModal
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Usuń sieć"
        description="Usunięcie usuwa też wszystkie wygenerowane adresy IP z magazynu."
        footer={
          <div className="flex items-center justify-end gap-2">
            <button className="px-3 py-2 rounded-md border" onClick={() => setDelOpen(false)}>
              Anuluj
            </button>
            <button className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground" onClick={doDelete}>
              Usuń
            </button>
          </div>
        }
      >
        {delErr ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{delErr}</div> : null}
        <div className="text-sm">Potwierdź usunięcie sieci. Jeśli jest używana – UI to zablokuje.</div>
      </SimpleModal>
    </div>
  );
}
