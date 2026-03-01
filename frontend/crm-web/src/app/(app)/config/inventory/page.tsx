"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { SimpleModal } from "@/components/SimpleModal";
import {
  AcquisitionKind,
  changeDeviceCondition,
  changeDeviceStatus,
  createReceipt,
  DeviceCondition,
  DeviceKind,
  DeviceStatus,
  editDevice,
  getInventoryState,
  InventoryDevice,
  InventoryReceiptDraft,
  prettyCondition,
  prettyKind,
  prettyStatus,
  subscribeInventory,
  updateModelAlarm,
} from "@/lib/mockInventory";

function useInventory() {
  return useSyncExternalStore(subscribeInventory, getInventoryState, getInventoryState);
}

function badgeClass(kind: string) {
  // statusy
  if (kind === "MAGAZYN") return "bg-emerald-600/15 text-emerald-700 border-emerald-600/20";
  if (kind === "KLIENT") return "bg-blue-600/15 text-blue-700 border-blue-600/20";
  if (kind === "SERWIS") return "bg-amber-600/15 text-amber-800 border-amber-600/20";
  if (kind === "WYSŁANY_NAPRAWA") return "bg-purple-600/15 text-purple-700 border-purple-600/20";

  // stany
  if (kind === "SPRAWNY") return "bg-emerald-600/15 text-emerald-700 border-emerald-600/20";
  if (kind === "NIEKOMPLETNY") return "bg-amber-600/15 text-amber-800 border-amber-600/20";
  if (kind === "USZKODZONY") return "bg-red-600/15 text-red-700 border-red-600/20";
  if (kind === "DO_KASACJI") return "bg-red-600/15 text-red-800 border-red-600/20";
  if (kind === "ARCHIWUM") return "bg-slate-600/15 text-slate-700 border-slate-600/20";

  // rodzaje
  if (kind === "ONT") return "bg-cyan-600/15 text-cyan-700 border-cyan-600/20";
  if (kind === "STB") return "bg-violet-600/15 text-violet-700 border-violet-600/20";
  if (kind === "ATA") return "bg-sky-600/15 text-sky-700 border-sky-600/20";
  if (kind === "ROUTER") return "bg-fuchsia-600/15 text-fuchsia-700 border-fuchsia-600/20";

  return "bg-muted text-foreground border-border";
}

function Badge({ children, tone }: { children: any; tone?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs ${badgeClass(tone ?? "")}`}>
      {children}
    </span>
  );
}

function normalizeMac(v: string) {
  const x = (v || "").trim();
  if (!x) return "";
  // bardzo lekka normalizacja (UI-only) – backend i tak będzie walidował
  const cleaned = x.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (cleaned.length === 12) {
    return cleaned.match(/.{1,2}/g)?.join(":") ?? x;
  }
  return x.toUpperCase();
}

function inputClass() {
  return "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
}

function selectClass() {
  return "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
}

function btnClass(tone: "primary" | "secondary" | "danger" = "secondary") {
  if (tone === "primary") return "rounded-md bg-foreground text-background px-3 py-2 text-sm hover:opacity-90";
  if (tone === "danger") return "rounded-md bg-red-600 text-white px-3 py-2 text-sm hover:opacity-90";
  return "rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60";
}

function todayIso() {
  const d = new Date();
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type EditorMode = "edit" | "status" | "condition" | "history";

export default function InventoryDevicesPage() {
  const inv = useInventory();

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | "all">("all");
  const [condFilter, setCondFilter] = useState<DeviceCondition | "all">("all");
  const [kindFilter, setKindFilter] = useState<DeviceKind | "all">("all");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("edit");

  const [receiptOpen, setReceiptOpen] = useState(false);

  const active = useMemo(() => inv.devices.find((d) => d.id === activeId) ?? null, [inv.devices, activeId]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inv.devices
      .filter((d) => (statusFilter === "all" ? true : d.status === statusFilter))
      .filter((d) => (condFilter === "all" ? true : d.condition === condFilter))
      .filter((d) => (kindFilter === "all" ? true : d.kind === kindFilter))
      .filter((d) => {
        if (!needle) return true;
        const hay = [
          d.model,
          d.serialNo,
          d.mac ?? "",
          prettyStatus(d.status),
          prettyCondition(d.condition),
          prettyKind(d.kind),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
  }, [inv.devices, q, statusFilter, condFilter, kindFilter]);

  const summary = useMemo(() => {
    // liczby per model + statusy
    const map = new Map<string, { kind: DeviceKind; model: string; counts: Record<DeviceStatus, number>; total: number }>();
    for (const d of inv.devices) {
      const key = `${d.kind}::${d.model}`;
      const row = map.get(key) ?? {
        kind: d.kind,
        model: d.model,
        counts: { MAGAZYN: 0, KLIENT: 0, SERWIS: 0, WYSŁANY_NAPRAWA: 0 },
        total: 0,
      };
      row.counts[d.status] += 1;
      row.total += 1;
      map.set(key, row);
    }

    const byModelId = new Map(inv.modelSummaries.map((m) => [`${m.kind}::${m.model}` as const, m]));

    // final
    const rows = Array.from(map.values())
      .map((r) => {
        const m = byModelId.get(`${r.kind}::${r.model}`);
        return {
          kind: r.kind,
          model: r.model,
          minAlarm: m?.minAlarm ?? 0,
          modelId: m?.id ?? null,
          counts: r.counts,
          total: r.total,
        };
      })
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.model.localeCompare(b.model));
    return rows;
  }, [inv.devices, inv.modelSummaries]);

  const missingMacCount = useMemo(() => inv.devices.filter((d) => !d.mac).length, [inv.devices]);
  const sentToRepairCount = useMemo(
    () => inv.devices.filter((d) => d.status === "WYSŁANY_NAPRAWA").length,
    [inv.devices]
  );
  const damagedCount = useMemo(
    () => inv.devices.filter((d) => d.condition === "USZKODZONY" || d.condition === "DO_KASACJI").length,
    [inv.devices]
  );

  function openEditor(id: string, m: EditorMode) {
    setActiveId(id);
    setMode(m);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Magazyn urządzeń</div>
          <div className="text-sm text-muted-foreground">
            UI-only: historia + powody zmian, bez backendu. Docelowo: audyt + operator history + powiązanie z addonami/usługami.
          </div>
        </div>

        <button className={btnClass("primary")} onClick={() => setReceiptOpen(true)}>
          + Dokument wejścia
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold">Skrót magazynu</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Razem</div>
              <div className="text-lg font-semibold">{inv.devices.length}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Brak MAC</div>
              <div className="text-lg font-semibold">{missingMacCount}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Naprawa</div>
              <div className="text-lg font-semibold">{sentToRepairCount}</div>
            </div>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Przykłady „mega przydatne później”: urządzenia w serwisie &gt; 14 dni, braki kompletacji po modelu,
            wysyłki vs zwroty, ubytki (kasacje) i „koszt utrzymania wypożyczeń” (STB od dostawcy).
          </div>
        </div>

        <div className="xl:col-span-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Zestawienie modeli</div>
              <div className="text-xs text-muted-foreground">liczby per model + statusy + alarm minimalny</div>
            </div>
            <div className="text-xs text-muted-foreground">Uszkodzone/do kasacji: {damagedCount}</div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-2">Rodzaj</th>
                  <th className="text-left py-2 pr-2">Model</th>
                  <th className="text-right py-2 pr-2">magazyn</th>
                  <th className="text-right py-2 pr-2">klient</th>
                  <th className="text-right py-2 pr-2">serwis</th>
                  <th className="text-right py-2 pr-2">naprawa</th>
                  <th className="text-right py-2 pr-2">razem</th>
                  <th className="text-right py-2">alarm min</th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 ? (
                  <tr>
                    <td className="py-3 text-sm text-muted-foreground" colSpan={8}>
                      Brak danych.
                    </td>
                  </tr>
                ) : null}
                {summary.map((r) => {
                  const low = r.counts.MAGAZYN < (r.minAlarm ?? 0);
                  return (
                    <tr key={`${r.kind}::${r.model}`} className="border-b border-border last:border-0">
                      <td className="py-2 pr-2">
                        <Badge tone={r.kind}>{prettyKind(r.kind)}</Badge>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="font-medium">{r.model}</div>
                        {low ? <div className="text-xs text-red-700">⬇ poniżej alarmu</div> : null}
                      </td>
                      <td className="py-2 pr-2 text-right">{r.counts.MAGAZYN}</td>
                      <td className="py-2 pr-2 text-right">{r.counts.KLIENT}</td>
                      <td className="py-2 pr-2 text-right">{r.counts.SERWIS}</td>
                      <td className="py-2 pr-2 text-right">{r.counts.WYSŁANY_NAPRAWA}</td>
                      <td className="py-2 pr-2 text-right font-semibold">{r.total}</td>
                      <td className="py-2 text-right">
                        <AlarmEditor modelId={r.modelId} minAlarm={r.minAlarm} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 text-xs text-muted-foreground">
            Alarm min: UI-only – w realu to ustawienie administracyjne per model (z audytem).
          </div>
        </div>
      </div>

      {/* Filtry */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">Szukaj</div>
            <input
              className={inputClass()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="model, serial, MAC, status..."
            />
          </div>

          <div className="w-full lg:w-52">
            <div className="text-xs text-muted-foreground mb-1">Rodzaj</div>
            <select className={selectClass()} value={kindFilter} onChange={(e) => setKindFilter(e.target.value as any)}>
              <option value="all">wszystkie</option>
              <option value="ONT">ONT</option>
              <option value="STB">STB</option>
              <option value="ATA">VoIP ATA</option>
              <option value="ROUTER">Router</option>
              <option value="INNY">Inny</option>
            </select>
          </div>

          <div className="w-full lg:w-52">
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <select className={selectClass()} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">wszystkie</option>
              <option value="MAGAZYN">magazyn</option>
              <option value="KLIENT">klient</option>
              <option value="SERWIS">serwis</option>
              <option value="WYSŁANY_NAPRAWA">wysłany do naprawy</option>
            </select>
          </div>

          <div className="w-full lg:w-52">
            <div className="text-xs text-muted-foreground mb-1">Stan</div>
            <select className={selectClass()} value={condFilter} onChange={(e) => setCondFilter(e.target.value as any)}>
              <option value="all">wszystkie</option>
              <option value="SPRAWNY">sprawny</option>
              <option value="NIEKOMPLETNY">niekompletny</option>
              <option value="USZKODZONY">uszkodzony</option>
              <option value="DO_KASACJI">do kasacji</option>
              <option value="ARCHIWUM">archiwum</option>
            </select>
          </div>

          <div className="text-xs text-muted-foreground lg:ml-auto">Wyniki: {view.length}</div>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left py-3 px-3">Rodzaj</th>
                <th className="text-left py-3 px-3">Model</th>
                <th className="text-left py-3 px-3">Serial</th>
                <th className="text-left py-3 px-3">MAC</th>
                <th className="text-left py-3 px-3">Status</th>
                <th className="text-left py-3 px-3">Stan</th>
                <th className="text-right py-3 px-3">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {view.length === 0 ? (
                <tr>
                  <td className="p-4 text-sm text-muted-foreground" colSpan={7}>
                    Brak wyników.
                  </td>
                </tr>
              ) : null}

              {view.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="py-3 px-3">
                    <Badge tone={d.kind}>{prettyKind(d.kind)}</Badge>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium">{d.model}</div>
                  </td>
                  <td className="py-3 px-3 font-mono text-xs">{d.serialNo}</td>
                  <td className="py-3 px-3 font-mono text-xs">{d.mac ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-3 px-3">
                    <Badge tone={d.status}>{prettyStatus(d.status)}</Badge>
                  </td>
                  <td className="py-3 px-3">
                    <Badge tone={d.condition}>{prettyCondition(d.condition)}</Badge>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button className={btnClass()} onClick={() => openEditor(d.id, "edit")}>
                        Edytuj
                      </button>
                      <button className={btnClass()} onClick={() => openEditor(d.id, "status")}>
                        Status
                      </button>
                      <button className={btnClass()} onClick={() => openEditor(d.id, "condition")}>
                        Stan
                      </button>
                      <button className={btnClass()} onClick={() => openEditor(d.id, "history")}>
                        Historia
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeviceEditorModal open={!!activeId} device={active} mode={mode} onClose={() => setActiveId(null)} />
      <ReceiptModal open={receiptOpen} onClose={() => setReceiptOpen(false)} />
    </div>
  );
}

function AlarmEditor({ modelId, minAlarm }: { modelId: string | null; minAlarm: number }) {
  const [v, setV] = useState<string>(String(minAlarm ?? 0));
  useEffect(() => setV(String(minAlarm ?? 0)), [minAlarm]);

  if (!modelId) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <input
        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs text-right"
        type="number"
        min={0}
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      <button
        className={btnClass()}
        onClick={() => {
          const n = Math.max(0, Math.floor(Number(v || 0)));
          updateModelAlarm(modelId, n);
        }}
      >
        Zapisz
      </button>
    </div>
  );
}

function DeviceEditorModal({
  open,
  device,
  mode,
  onClose,
}: {
  open: boolean;
  device: InventoryDevice | null;
  mode: EditorMode;
  onClose: () => void;
}) {
  const inv = useInventory();

  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  // edit
  const [model, setModel] = useState("");
  const [serialNo, setSerialNo] = useState("");
  const [mac, setMac] = useState("");
  const [kind, setKind] = useState<DeviceKind>("ONT");

  // status/condition
  const [status, setStatus] = useState<DeviceStatus>("MAGAZYN");
  const [cond, setCond] = useState<DeviceCondition>("SPRAWNY");

  useEffect(() => {
    if (!open || !device) return;
    setErr(null);
    setReason("");

    setModel(device.model);
    setSerialNo(device.serialNo);
    setMac(device.mac ?? "");
    setKind(device.kind);
    setStatus(device.status);
    setCond(device.condition);
  }, [open, device?.id, mode]);

  if (!open || !device) return null;

  const title =
    mode === "edit"
      ? `Edytuj: ${device.model} (${device.serialNo})`
      : mode === "status"
        ? `Wydanie / status: ${device.model} (${device.serialNo})`
        : mode === "condition"
          ? `Stan urządzenia: ${device.model} (${device.serialNo})`
          : `Historia: ${device.model} (${device.serialNo})`;

  // ✅ FIX: capture stable id after guard (prevents TS 'device possibly null' in closures)
  const deviceId = device.id;

  function saveEdit() {
    try {
      setErr(null);
      editDevice(
        deviceId,
        {
          kind,
          model: model.trim(),
          serialNo: serialNo.trim(),
          mac: normalizeMac(mac) || undefined,
        },
        reason
      );
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Błąd zapisu");
    }
  }

  function saveStatus() {
    try {
      setErr(null);
      changeDeviceStatus(deviceId, status, reason);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Błąd zmiany statusu");
    }
  }

  function saveCondition() {
    try {
      setErr(null);
      changeDeviceCondition(deviceId, cond, reason);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Błąd zmiany stanu");
    }
  }

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-muted-foreground">
        {mode === "history" ? "" : "Zmiany są audytowalne – powód jest obowiązkowy."}
      </div>
      <div className="flex gap-2">
        <button className={btnClass()} onClick={onClose}>
          Anuluj
        </button>
        {mode === "edit" ? (
          <button className={btnClass("primary")} onClick={saveEdit}>
            Zapisz
          </button>
        ) : null}
        {mode === "status" ? (
          <button className={btnClass("primary")} onClick={saveStatus}>
            Zapisz
          </button>
        ) : null}
        {mode === "condition" ? (
          <button className={btnClass("primary")} onClick={saveCondition}>
            Zapisz
          </button>
        ) : null}
      </div>
    </div>
  );

  const history = useMemo(() => {
  return inv.historyByDeviceId[device.id] ?? [];
}, [inv.historyByDeviceId, device.id]);

  return (
    <SimpleModal open={open} title={title} description="UI-only: edycja / zmiana statusu / stan / historia" onClose={onClose} footer={footer}>
      {err ? (
        <div className="rounded-md border border-red-600/30 bg-red-600/10 p-3 text-sm text-red-700">{err}</div>
      ) : null}

      {mode === "edit" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Rodzaj</div>
            <select className={selectClass()} value={kind} onChange={(e) => setKind(e.target.value as any)}>
              <option value="ONT">ONT</option>
              <option value="STB">STB</option>
              <option value="ATA">VoIP ATA</option>
              <option value="ROUTER">Router</option>
              <option value="INNY">Inny</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Model</div>
            <input className={inputClass()} value={model} onChange={(e) => setModel(e.target.value)} />
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Serial</div>
            <input className={inputClass()} value={serialNo} onChange={(e) => setSerialNo(e.target.value)} />
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">MAC</div>
            <input className={inputClass()} value={mac} onChange={(e) => setMac(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
          </div>

          <div className="lg:col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Powód (wymagane)</div>
            <textarea className={inputClass()} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      ) : null}

      {mode === "status" ? (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Nowy status</div>
            <select className={selectClass()} value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="MAGAZYN">magazyn</option>
              <option value="KLIENT">klient</option>
              <option value="SERWIS">serwis</option>
              <option value="WYSŁANY_NAPRAWA">wysłany do naprawy</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Powód (wymagane)</div>
            <textarea className={inputClass()} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      ) : null}

      {mode === "condition" ? (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Nowy stan</div>
            <select className={selectClass()} value={cond} onChange={(e) => setCond(e.target.value as any)}>
              <option value="SPRAWNY">sprawny</option>
              <option value="NIEKOMPLETNY">niekompletny</option>
              <option value="USZKODZONY">uszkodzony</option>
              <option value="DO_KASACJI">do kasacji</option>
              <option value="ARCHIWUM">archiwum</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Powód (wymagane)</div>
            <textarea className={inputClass()} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      ) : null}

      {mode === "history" ? (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Tip: później dołożymy filtrowanie po akcjach + link do obiektu (abonent/umowa/zlecenie/serwis).
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="max-h-[55vh] overflow-y-auto">
              {history.length === 0 ? <div className="p-3 text-sm text-muted-foreground">Brak historii.</div> : null}
              {history.map((h: any) => (
                <div key={h.id} className="p-3 border-b border-border last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={h.action === "STATUS_CHANGE" ? "WYSŁANY_NAPRAWA" : "MAGAZYN"}>{h.action}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(h.atIso).toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{h.actor}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-sm">{h.reason}</div>
                  {h.before || h.after ? (
                    <div className="mt-2 text-xs text-muted-foreground font-mono whitespace-pre-wrap">
                      {JSON.stringify({ before: h.before, after: h.after, meta: h.meta }, null, 2)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </SimpleModal>
  );
}

function ReceiptModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("Przyjęcie na magazyn");

  const [invoiceNo, setInvoiceNo] = useState("");
  const [vendor, setVendor] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [acq, setAcq] = useState<AcquisitionKind>("KUPIONY");
  const [kind, setKind] = useState<DeviceKind>("ONT");
  const [model, setModel] = useState("FTECH 01");
  const [unitValue, setUnitValue] = useState<string>("199");

  const [items, setItems] = useState<Array<{ serialNo: string; mac?: string }>>([{ serialNo: "", mac: "" }]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
  }, [open]);

  function addRow() {
    setItems((prev) => [...prev, { serialNo: "", mac: "" }]);
  }

  function removeRow(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, patch: Partial<{ serialNo: string; mac: string }>) {
    setItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function save() {
    try {
      setErr(null);
      const draft: InventoryReceiptDraft = {
        invoiceNo: invoiceNo.trim() || undefined,
        vendor: vendor.trim() || undefined,
        invoiceDate: invoiceDate || undefined,
        acquisitionKind: acq,
        kind,
        model: model.trim(),
        unitValuePln: Number(unitValue || 0) || undefined,
        items: items
          .map((r) => ({ serialNo: r.serialNo.trim(), mac: normalizeMac(r.mac || "") || undefined }))
          .filter((r) => r.serialNo),
      };
      createReceipt(draft, reason);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Błąd zapisu");
    }
  }

  return (
    <SimpleModal
      open={open}
      title="Dokument wejścia (przyjęcie na magazyn)"
      description="Wprowadzasz fakturę/pochodzenie + listę urządzeń (serial + opcjonalny MAC)."
      onClose={onClose}
      className="max-w-4xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">Powód przyjęcia jest wymagany (audyt).</div>
          <div className="flex gap-2">
            <button className={btnClass()} onClick={onClose}>
              Anuluj
            </button>
            <button className={btnClass("primary")} onClick={save}>
              Zapisz
            </button>
          </div>
        </div>
      }
    >
      {err ? <div className="rounded-md border border-red-600/30 bg-red-600/10 p-3 text-sm text-red-700">{err}</div> : null}

      {/* ...reszta pliku bez zmian... */}
    </SimpleModal>
  );
}