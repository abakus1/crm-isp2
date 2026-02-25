"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import { SimpleModal } from "@/components/SimpleModal";
import {
  assignAddress,
  getIpamState,
  IpAddress,
  IpAddressMode,
  IpAddressStatus,
  IpNetworkType,
  IpNetworkUsage,
  subscribeIpam,
  unassignAddress,
} from "@/lib/mockIpam";

function useIpam() {
  return useSyncExternalStore(subscribeIpam, getIpamState, getIpamState);
}

function badgeClass(kind: string) {
  if (kind === "PUBLIC") return "bg-emerald-500/10 border-emerald-500/30";
  if (kind === "PRIVATE") return "bg-sky-500/10 border-sky-500/30";
  if (kind === "ASSIGNED") return "bg-amber-500/10 border-amber-500/30";
  if (kind === "FREE") return "bg-muted/30 border-border";
  return "bg-muted/20 border-border";
}

function Badge({ children, tone }: { children: string; tone?: string }) {
  return (
    <span className={["inline-flex items-center rounded-md border px-2 py-0.5 text-xs", badgeClass(tone ?? children)].join(" ")}> 
      {children}
    </span>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function IpAddressesPage() {
  const ipam = useIpam();

  const networksById = useMemo(() => {
    const m = new Map(ipam.networks.map((n) => [n.id, n] as const));
    return m;
  }, [ipam.networks]);

  const freeByNetwork = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ipam.addresses) if (a.status === "FREE") m.set(a.networkId, (m.get(a.networkId) ?? 0) + 1);
    return m;
  }, [ipam.addresses]);

  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | IpAddressStatus>("all");
  const [filterMode, setFilterMode] = useState<"all" | IpAddressMode>("all");
  const [filterType, setFilterType] = useState<"all" | IpNetworkType>("all");
  const [filterUsage, setFilterUsage] = useState<"all" | IpNetworkUsage>("all");

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ipam.addresses
      .filter((a) => (filterStatus === "all" ? true : a.status === filterStatus))
      .filter((a) => (filterMode === "all" ? true : (a.mode ?? "") === filterMode))
      .filter((a) => {
        const net = networksById.get(a.networkId);
        if (!net) return true;
        if (filterType !== "all" && net.type !== filterType) return false;
        if (filterUsage !== "all" && net.usage !== filterUsage) return false;
        return true;
      })
      .filter((a) => {
        if (!needle) return true;
        const net = networksById.get(a.networkId);
        const hay = [
          a.ip,
          a.description,
          a.status,
          a.mode ?? "",
          a.customerName ?? "",
          a.mac ?? "",
          a.pppoeLogin ?? "",
          net?.cidr ?? "",
          net?.description ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      })
      .sort((x, y) => x.ip.localeCompare(y.ip));
  }, [
    ipam.addresses,
    q,
    filterStatus,
    filterMode,
    filterType,
    filterUsage,
    networksById,
  ]);

  // ---------- Details modal ----------
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const selected = useMemo(() => ipam.addresses.find((a) => a.id === detailsId) ?? null, [ipam.addresses, detailsId]);
  const selectedNet = selected ? networksById.get(selected.networkId) ?? null : null;

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [mode, setMode] = useState<IpAddressMode>("STATIC");
  const [expiresAtIso, setExpiresAtIso] = useState("");
  const [desc, setDesc] = useState("");
  const [pppoeLogin, setPppoeLogin] = useState("");
  const [pppoePassword, setPppoePassword] = useState("");
  const [mac, setMac] = useState("");

  function openDetails(a: IpAddress) {
    setDetailsId(a.id);
    setDetailsOpen(true);
    setAssignOpen(false);
    setAssignErr(null);
  }

  function openAssign() {
    if (!selected) return;
    setAssignOpen(true);
    setAssignErr(null);
    setCustomerName(selected.customerName ?? "");
    setMode(selected.mode ?? "STATIC");
    setExpiresAtIso(selected.expiresAtIso ?? "");
    setDesc(selected.description ?? "");
    setPppoeLogin(selected.pppoeLogin ?? "");
    setPppoePassword(selected.pppoePassword ?? "");
    setMac(selected.mac ?? "");
  }

  function doAssign() {
    try {
      if (!selected) return;
      if (!customerName.trim()) throw new Error("Nazwa klienta jest wymagana (UI-only placeholder). ");

      // guard: sieci GEMINI nie wolno przydzielać klientom
      if (selectedNet?.usage === "GEMINI") {
        throw new Error("Ta sieć jest oznaczona jako GEMINI (infrastruktura) – nie przydzielamy jej klientom.");
      }

      if (mode === "DHCP" && !mac.trim()) throw new Error("Dla DHCP wymagany jest MAC.");
      assignAddress(selected.id, {
        customerName,
        mode,
        expiresAtIso,
        description: desc,
        pppoeLogin,
        pppoePassword,
        mac,
      });
      setAssignOpen(false);
    } catch (e: any) {
      setAssignErr(e?.message ?? "Błąd przydziału");
    }
  }

  function doUnassign() {
    if (!selected) return;
    unassignAddress(selected.id);
    setAssignOpen(false);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Konfiguracja → Magazyn IP → Adresy IP</div>
          <div className="text-xs text-muted-foreground">
            Globalny widok adresów. Wyszukiwarka na górze + detale, żeby szybko sprawdzić przynależność i tryb.
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
            placeholder="IP / klient / CIDR / PPPoE login / MAC"
            className="mt-1 rounded-md border px-3 py-2 text-sm w-80"
          />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Status</div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="mt-1 rounded-md border px-3 py-2 text-sm"
          >
            <option value="all">Wszystkie</option>
            <option value="FREE">Wolne</option>
            <option value="ASSIGNED">Przydzielone</option>
            <option value="RESERVED">Zarezerwowane</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Tryb</div>
          <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as any)} className="mt-1 rounded-md border px-3 py-2 text-sm">
            <option value="all">Wszystkie</option>
            <option value="DHCP">DHCP</option>
            <option value="PPPOE">PPPoE</option>
            <option value="STATIC">Static</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Public/Private</div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="mt-1 rounded-md border px-3 py-2 text-sm">
            <option value="all">Wszystkie</option>
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Przeznaczenie</div>
          <select value={filterUsage} onChange={(e) => setFilterUsage(e.target.value as any)} className="mt-1 rounded-md border px-3 py-2 text-sm">
            <option value="all">Wszystkie</option>
            <option value="CLIENT">Kliencka</option>
            <option value="GEMINI">Urządzenia Gemini</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-3 text-left w-16">Lp</th>
              <th className="p-3 text-left">IP</th>
              <th className="p-3 text-left">Opis</th>
              <th className="p-3 text-left">Public/Private</th>
              <th className="p-3 text-left">DHCP/PPPoE/Static</th>
              <th className="p-3 text-left">Klient</th>
              <th className="p-3 text-left">Przydzielono</th>
              <th className="p-3 text-left">Wygasa</th>
              <th className="p-3 text-right">Free w sieci</th>
              <th className="p-3 text-right">Szczegóły</th>
            </tr>
          </thead>
          <tbody>
            {view.map((a, idx) => {
              const net = networksById.get(a.networkId);
              const free = freeByNetwork.get(a.networkId) ?? 0;
              return (
                <tr key={a.id} className="border-t">
                  <td className="p-3 text-muted-foreground">{idx + 1}</td>
                  <td className="p-3">
                    <div className="font-mono text-xs">{a.ip}</div>
                    <div className="text-xs text-muted-foreground">{net?.cidr ?? "–"}</div>
                  </td>
                  <td className="p-3">{a.description || "–"}</td>
                  <td className="p-3">
                    <Badge tone={net?.type ?? ""}>{net?.type ?? "–"}</Badge>
                    <div className="text-xs text-muted-foreground mt-1">{net?.usage === "GEMINI" ? "GEMINI" : "CLIENT"}</div>
                  </td>
                  <td className="p-3">
                    {a.mode ? <Badge>{a.mode}</Badge> : <span className="text-xs text-muted-foreground">–</span>}
                    <div className="text-xs text-muted-foreground mt-1">
                      <Badge tone={a.status}>{a.status}</Badge>
                    </div>
                  </td>
                  <td className="p-3">{a.customerName || <span className="text-muted-foreground">–</span>}</td>
                  <td className="p-3">{a.assignedAtIso || <span className="text-muted-foreground">–</span>}</td>
                  <td className="p-3">{a.expiresAtIso || <span className="text-muted-foreground">–</span>}</td>
                  <td className="p-3 text-right font-semibold">{free}</td>
                  <td className="p-3 text-right">
                    <button className="px-3 py-1.5 rounded-md border" onClick={() => openDetails(a)}>
                      Details
                    </button>
                  </td>
                </tr>
              );
            })}
            {view.length === 0 && (
              <tr>
                <td className="p-6 text-sm text-muted-foreground" colSpan={10}>
                  Brak wyników.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SimpleModal
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setAssignOpen(false);
        }}
        title={selected ? `Adres IP: ${selected.ip}` : "Adres IP"}
        description="Szczegóły adresu + przydzielanie (UI-only)."
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">Dziś: {todayIso()}</div>
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded-md border" onClick={() => setDetailsOpen(false)}>
                Zamknij
              </button>
              {selected?.status === "FREE" ? (
                <button className="px-3 py-2 rounded-md bg-primary text-primary-foreground" onClick={openAssign}>
                  Przydziel
                </button>
              ) : (
                <button className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground" onClick={doUnassign}>
                  Zwalnij
                </button>
              )}
            </div>
          </div>
        }
      >
        {!selected ? (
          <div className="text-sm text-muted-foreground">Brak rekordu.</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Sieć</div>
                <div className="font-mono text-sm mt-1">{selectedNet?.cidr ?? "–"}</div>
                <div className="text-xs text-muted-foreground mt-1">{selectedNet?.description || "–"}</div>
                <div className="flex gap-2 mt-2">
                  <Badge tone={selectedNet?.type ?? ""}>{selectedNet?.type ?? "–"}</Badge>
                  <Badge>{selectedNet?.usage === "GEMINI" ? "GEMINI" : "CLIENT"}</Badge>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Adres</div>
                <div className="font-mono text-sm mt-1">{selected.ip}</div>
                <div className="flex gap-2 mt-2">
                  <Badge tone={selected.status}>{selected.status}</Badge>
                  {selected.mode ? <Badge>{selected.mode}</Badge> : <Badge>–</Badge>}
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Dziedziczone z sieci</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                <div>
                  <div className="text-xs text-muted-foreground">Gateway</div>
                  <div className="font-mono text-sm">{selected.gateway}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">DNS 1</div>
                  <div className="font-mono text-sm">{selected.dns1}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">DNS 2</div>
                  <div className="font-mono text-sm">{selected.dns2}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Dane z listy</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div>
                  <div className="text-xs text-muted-foreground">Opis</div>
                  <div className="text-sm">{selected.description || "–"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Klient</div>
                  <div className="text-sm">{selected.customerName || "–"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Data przydzielenia</div>
                  <div className="text-sm">{selected.assignedAtIso || "–"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Data wygaśnięcia</div>
                  <div className="text-sm">{selected.expiresAtIso || "–"}</div>
                </div>
              </div>
            </div>

            {assignOpen && (
              <div className="rounded-xl border p-4 bg-muted/10">
                <div className="text-sm font-semibold">Przydziel adres (UI-only)</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Docelowo to będzie: Umowa → Subskrypcja → Usługa (Addon: Adres IP). Na razie wpisujesz nazwę klienta.
                </div>

                {assignErr ? (
                  <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{assignErr}</div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Klient (placeholder)</div>
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="mt-1 rounded-md border px-3 py-2 text-sm w-full"
                      placeholder="np. Jan Kowalski"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Tryb</div>
                    <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="mt-1 rounded-md border px-3 py-2 text-sm w-full">
                      <option value="DHCP">DHCP</option>
                      <option value="PPPOE">PPPoE</option>
                      <option value="STATIC">Static</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground">Opis</div>
                    <input
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      className="mt-1 rounded-md border px-3 py-2 text-sm w-full"
                      placeholder="np. Public IP do Internet PRO"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Data wygaśnięcia (opcjonalnie)</div>
                    <input
                      value={expiresAtIso}
                      onChange={(e) => setExpiresAtIso(e.target.value)}
                      className="mt-1 rounded-md border px-3 py-2 text-sm w-full"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>

                  {mode === "PPPOE" && (
                    <>
                      <div>
                        <div className="text-xs text-muted-foreground">PPPoE login</div>
                        <input value={pppoeLogin} onChange={(e) => setPppoeLogin(e.target.value)} className="mt-1 rounded-md border px-3 py-2 text-sm w-full" placeholder="auto" />
                        <div className="text-xs text-muted-foreground mt-1">Jeśli puste – system wygeneruje.</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">PPPoE hasło</div>
                        <input value={pppoePassword} onChange={(e) => setPppoePassword(e.target.value)} className="mt-1 rounded-md border px-3 py-2 text-sm w-full" placeholder="auto" />
                        <div className="text-xs text-muted-foreground mt-1">Jeśli puste – system wygeneruje.</div>
                      </div>
                    </>
                  )}

                  {mode === "DHCP" && (
                    <div>
                      <div className="text-xs text-muted-foreground">MAC</div>
                      <input value={mac} onChange={(e) => setMac(e.target.value)} className="mt-1 rounded-md border px-3 py-2 text-sm w-full" placeholder="AA:BB:CC:DD:EE:FF" />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button className="px-3 py-2 rounded-md border" onClick={() => setAssignOpen(false)}>
                    Anuluj
                  </button>
                  <button className="px-3 py-2 rounded-md bg-primary text-primary-foreground" onClick={doAssign}>
                    Zapisz przydział
                  </button>
                </div>
              </div>
            )}

            {selected.status !== "FREE" && !assignOpen && (
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Dane specyficzne</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <div>
                    <div className="text-xs text-muted-foreground">PPPoE login</div>
                    <div className="font-mono text-sm">{selected.pppoeLogin || "–"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">PPPoE hasło</div>
                    <div className="font-mono text-sm">{selected.pppoePassword || "–"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">MAC (DHCP)</div>
                    <div className="font-mono text-sm">{selected.mac || "–"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </SimpleModal>
    </div>
  );
}
