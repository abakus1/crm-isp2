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

function maskSecret(v: string) {
  // UI-only: nigdy nie pokazujemy hasła wprost (nawet w mocku).
  if (!v) return "–";
  const n = Math.min(12, Math.max(6, v.length));
  return "•".repeat(n);
}

function badgeClass(kind: string) {
  if (kind === "FREE") return "bg-emerald-600/15 text-emerald-700 border-emerald-600/20";
  if (kind === "ASSIGNED") return "bg-blue-600/15 text-blue-700 border-blue-600/20";
  if (kind === "RESERVED") return "bg-amber-600/15 text-amber-800 border-amber-600/20";
  if (kind === "PUBLIC") return "bg-purple-600/15 text-purple-700 border-purple-600/20";
  if (kind === "PRIVATE") return "bg-slate-600/15 text-slate-700 border-slate-600/20";
  return "bg-muted text-foreground border-border";
}

function Badge({
  children,
  tone,
}: {
  children: any;
  tone?: string;
}) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs ${badgeClass(tone ?? "")}`}>{children}</span>
  );
}

function todayIso() {
  const d = new Date();
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function IpAddressesPage() {
  const ipam = useIpam();

  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<IpAddressStatus | "all">("all");
  const [filterMode, setFilterMode] = useState<IpAddressMode | "all">("all");
  const [filterType, setFilterType] = useState<IpNetworkType | "all">("all");
  const [filterUsage, setFilterUsage] = useState<IpNetworkUsage | "all">("all");

  const networksById = useMemo(() => new Map(ipam.networks.map((n) => [n.id, n])), [ipam.networks]);

  const freeByNetwork = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ipam.addresses) {
      if (a.status === "FREE") {
        m.set(a.networkId, (m.get(a.networkId) ?? 0) + 1);
      }
    }
    return m;
  }, [ipam.addresses]);

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

  // Historia adresu (UI-only)
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyEvents = useMemo(() => {
    if (!selected) return [];
    return (ipam.addressHistory?.[selected.id] ?? []).slice();
  }, [ipam.addressHistory, selected]);

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
    setHistoryOpen(false);
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

  function doUnassign() {
    if (!selected) return;
    unassignAddress(selected.id);
    setAssignOpen(false);
  }

  function doAssign() {
    if (!selected) return;

    try {
      // minimalne walidacje UI-only
      if (!customerName.trim()) throw new Error("Wpisz nazwę klienta.");
      if (mode === "PPPOE") {
        // PPPoE: login/hasło mogą być puste -> system wygeneruje
      }
      if (mode === "DHCP") {
        if (!mac.trim()) throw new Error("Dla DHCP wymagany jest MAC.");
      }

      assignAddress(selected.id, {
        customerName,
        mode,
        expiresAtIso: expiresAtIso || undefined,
        description: desc || undefined,
        pppoeLogin: mode === "PPPOE" ? pppoeLogin || undefined : undefined,
        pppoePassword: mode === "PPPOE" ? pppoePassword || undefined : undefined,
        mac: mode === "DHCP" ? mac || undefined : undefined,
      });

      setAssignOpen(false);
      setAssignErr(null);
    } catch (e: any) {
      setAssignErr(e?.message ?? "Nieznany błąd.");
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-2xl font-semibold">Magazyn adresów IP</div>
          <div className="text-sm text-muted-foreground mt-1">
            UI-only. Docelowo: dane będą wynikać z Umów/Subskrypcji + provisioning (RADIUS/DHCP/router).
          </div>
        </div>

        <div className="flex gap-2">
          <Link href="/config/ip" className="px-3 py-2 rounded-md border">
            IPAM: Podsumowanie
          </Link>
          <Link href="/config/ip/networks" className="px-3 py-2 rounded-md border">
            Sieci IP
          </Link>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
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
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="mt-1 rounded-md border px-3 py-2 text-sm">
              <option value="all">Wszystkie</option>
              <option value="FREE">FREE</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="RESERVED">RESERVED</option>
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
              <option value="GEMINI">GEMINI</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-3 text-left w-16">Lp</th>
              <th className="p-3 text-left">IP</th>
              <th className="p-3 text-left">Opis</th>
              <th className="p-3 text-left">Klasa sieci</th>
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
                  <td className="p-3">{net?.description || <span className="text-muted-foreground">–</span>}</td>
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
                      Detail
                    </button>
                  </td>
                </tr>
              );
            })}
            {view.length === 0 && (
              <tr>
                <td className="p-4 text-sm text-muted-foreground" colSpan={11}>
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
          setHistoryOpen(false);
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
              <button className="px-3 py-2 rounded-md border" onClick={() => setHistoryOpen(true)}>
                Historia
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
                      placeholder="np. adres IP dla ONT"
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
                    <div className="text-xs text-muted-foreground mt-1">W UI-only nie walidujemy kalendarza.</div>
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
                      <div className="text-xs text-muted-foreground mt-1">MAC identyfikuje urządzenie w DHCP.</div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-4">
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

                {selected.mode === "DHCP" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div>
                      <div className="text-xs text-muted-foreground">MAC address</div>
                      <div className="font-mono text-sm">{selected.mac || "–"}</div>
                    </div>
                  </div>
                ) : selected.mode === "PPPOE" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Login</div>
                      <div className="font-mono text-sm">{selected.pppoeLogin || "–"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Hasło</div>
                      <div className="font-mono text-sm">{selected.pppoePassword ? maskSecret(selected.pppoePassword) : "–"}</div>
                    </div>
                  </div>
                ) : selected.mode === "STATIC" ? (
                  <div className="text-sm mt-2 text-muted-foreground">STATIC – bez dodatkowych danych.</div>
                ) : (
                  <div className="text-sm mt-2 text-muted-foreground">Brak danych specyficznych.</div>
                )}
              </div>
            )}
          </div>
        )}
      </SimpleModal>

      <SimpleModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={selected ? `Historia: ${selected.ip}` : "Historia adresu"}
        description="Log zdarzeń dla tego adresu (UI-only). Docelowo: audyt + staff_user + statusy blokad."
        footer={
          <div className="flex justify-end">
            <button className="px-3 py-2 rounded-md border" onClick={() => setHistoryOpen(false)}>
              Zamknij
            </button>
          </div>
        }
      >
        {!selected ? (
          <div className="text-sm text-muted-foreground">Brak rekordu.</div>
        ) : historyEvents.length === 0 ? (
          <div className="text-sm text-muted-foreground">Brak zdarzeń dla tego adresu.</div>
        ) : (
          <div className="space-y-2">
            {historyEvents.map((ev) => (
              <div key={ev.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{ev.action}</div>
                  <div className="text-xs text-muted-foreground">{new Date(ev.atIso).toLocaleString()}</div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Kto: {ev.actor}</div>
                {ev.note ? <div className="text-xs mt-1">{ev.note}</div> : null}
                {(ev.before || ev.after) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-xs">
                    <div className="rounded-md border bg-muted/10 p-2">
                      <div className="text-muted-foreground">Przed</div>
                      <pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(ev.before ?? {}, null, 2)}</pre>
                    </div>
                    <div className="rounded-md border bg-muted/10 p-2">
                      <div className="text-muted-foreground">Po</div>
                      <pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(ev.after ?? {}, null, 2)}</pre>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SimpleModal>
    </div>
  );
}