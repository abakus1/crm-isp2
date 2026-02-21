// frontend/crm-web/src/app/(app)/staff/[id]/permission/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { SimpleModal } from "@/components/SimpleModal";
import { PrgAddressFinder, PrgAddressPick } from "@/components/PrgAddressFinder";

type StaffAddressPrg = {
  place_name: string;
  terc: string;
  simc: string;
  street_name: string;
  ulic: string;
  building_no: string;
  local_no?: string | null;
};

type StaffOut = {
  id: number;
  username: string;
  email?: string | null;
  role: string;
  status: string;
  must_change_credentials: boolean;
  mfa_required: boolean;

  first_name?: string | null;
  last_name?: string | null;
  phone_company?: string | null;
  job_title?: string | null;
  birth_date?: string | null;
  pesel?: string | null;
  id_document_no?: string | null;

  // legacy
  address_registered?: string | null;
  address_current?: string | null;

  // PRG structured (nowe)
  address_registered_prg?: StaffAddressPrg | null;
  address_current_prg?: StaffAddressPrg | null;

  address_current_same_as_registered?: boolean;
};

type Role = {
  code: string;
  label_pl: string;
  description_pl: string;
};

type ResolvedAction = {
  code: string;
  label_pl: string;
  description_pl: string;
  allowed: boolean;
  source: "role" | "override_allow" | "override_deny" | "none";
  override: "allow" | "deny" | null;
};

type OverrideEffect = "allow" | "deny" | null;

function Pill({ tone, text }: { tone: "ok" | "warn" | "muted"; text: string }) {
  const base = "inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] leading-4";
  const cls =
    tone === "ok" ? "bg-emerald-500/10" : tone === "warn" ? "bg-amber-500/10" : "bg-muted/40";
  return <span className={`${base} ${cls}`}>{text}</span>;
}

function formatPrgAddress(prg: StaffAddressPrg | null | undefined) {
  if (!prg) return "";
  const parts: string[] = [];
  if (prg.place_name) parts.push(prg.place_name);

  const streetAndNo = [prg.street_name, prg.building_no].filter(Boolean).join(" ");
  if (streetAndNo) parts.push(streetAndNo);

  if (prg.local_no) parts.push(`lok. ${prg.local_no}`);

  const s = parts.join(", ").trim();
  return s || "";
}

function pickToPrg(p: PrgAddressPick): StaffAddressPrg {
  return {
    place_name: p.place_name,
    terc: p.terc,
    simc: p.simc,
    street_name: p.street_name,
    ulic: p.ulic,
    building_no: p.building_no,
    local_no: null,
  };
}

export default function StaffManagePage() {
  const { token, logout } = useAuth();
  const perms = usePermissions();
  const router = useRouter();
  const params = useParams();
  const staffId = Number(params?.id);

  const [staff, setStaff] = useState<StaffOut | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [resolved, setResolved] = useState<ResolvedAction[]>([]);

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // role modal
  const [openRole, setOpenRole] = useState(false);
  const [nextRole, setNextRole] = useState<string>("");

  // profile modal
  const [openProfile, setOpenProfile] = useState(false);
  const [profileTab, setProfileTab] = useState<"basic" | "reg" | "cur">("basic");
  const [pFirst, setPFirst] = useState("");
  const [pLast, setPLast] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pTitle, setPTitle] = useState("");
  const [pBirth, setPBirth] = useState("");
  const [pPesel, setPPesel] = useState("");
  const [pDoc, setPDoc] = useState("");

  // legacy (textarea)
  const [pAddrReg, setPAddrReg] = useState("");
  const [pAddrCur, setPAddrCur] = useState("");

  // PRG structured (finder)
  const [pAddrRegPrg, setPAddrRegPrg] = useState<StaffAddressPrg | null>(null);
  const [pAddrCurPrg, setPAddrCurPrg] = useState<StaffAddressPrg | null>(null);

  const [pAddrSame, setPAddrSame] = useState(true);
  const [pMfaReq, setPMfaReq] = useState(true);

  // permissions edit
  const [q, setQ] = useState("");
  const [overrides, setOverrides] = useState<Record<string, OverrideEffect>>({});
  const [originalOverrides, setOriginalOverrides] = useState<Record<string, OverrideEffect>>({});

  function handleUnauthorized() {
    logout();
    router.replace("/login");
  }

  const canOpen = perms.loaded;
  const canReadStaff = perms.has("staff.read");
  const canUpdateProfile = perms.has("staff.update");
  const canSetRole = perms.has("staff.role.set");
  const canPermRead = perms.has("staff.permissions.read");
  const canPermWrite = perms.has("staff.permissions.write");

  const canUsePage = canReadStaff && (canUpdateProfile || canSetRole || canPermRead || canPermWrite);

  async function loadAll() {
    if (!token || !Number.isFinite(staffId)) return;

    setError(null);
    setOk(null);
    setBusy(true);

    try {
      if (!canReadStaff) throw new ApiError(403, "Brak uprawnienia: staff.read");

      const u = await apiFetch<StaffOut>(`/staff/${staffId}`, {
        method: "GET",
        token,
        onUnauthorized: handleUnauthorized,
      });
      setStaff(u);

      if (perms.has("rbac.roles.list")) {
        const rs = await apiFetch<Role[]>(`/rbac/roles`, {
          method: "GET",
          token,
          onUnauthorized: handleUnauthorized,
        });
        setRoles(rs);
      } else {
        setRoles([]);
      }

      if (canPermRead) {
        const out = await apiFetch<ResolvedAction[]>(`/staff/${staffId}/permissions`, {
          method: "GET",
          token,
          onUnauthorized: handleUnauthorized,
        });
        setResolved(out);

        const ov: Record<string, OverrideEffect> = {};
        for (const a of out) ov[a.code] = a.override;
        setOverrides(ov);
        setOriginalOverrides(ov);
      } else {
        setResolved([]);
        setOverrides({});
        setOriginalOverrides({});
      }

      setNextRole(u.role);
      seedProfileForm(u);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd ładowania");
      setStaff(null);
      setRoles([]);
      setResolved([]);
      setOverrides({});
      setOriginalOverrides({});
    } finally {
      setBusy(false);
    }
  }

  function seedProfileForm(u: StaffOut) {
    setPFirst(u.first_name || "");
    setPLast(u.last_name || "");
    setPEmail(u.email || "");
    setPPhone(u.phone_company || "");
    setPTitle(u.job_title || "");
    setPBirth(u.birth_date || "");
    setPPesel(u.pesel || "");
    setPDoc(u.id_document_no || "");

    // PRG first
    const regPrg = u.address_registered_prg || null;
    const curPrg = u.address_current_prg || null;
    setPAddrRegPrg(regPrg);
    setPAddrCurPrg(curPrg);

    // legacy (best effort)
    setPAddrReg(u.address_registered || formatPrgAddress(regPrg) || "");
    setPAddrCur(u.address_current || formatPrgAddress(curPrg) || "");

    setPAddrSame(!!u.address_current_same_as_registered);
    setPMfaReq(!!u.mfa_required);

    // default tab
    setProfileTab("basic");
  }

  function TabButton({
    active,
    children,
    onClick,
  }: {
    active: boolean;
    children: ReactNode;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={[
          "h-9 rounded-md border px-3 text-sm",
          active ? "border-border bg-background" : "border-transparent bg-muted/40 hover:bg-muted/60",
        ].join(" ")}
      >
        {children}
      </button>
    );
  }

  useEffect(() => {
    if (canOpen) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, staffId, canOpen]);

  const roleLabel = useMemo(() => {
    const r = roles.find((x) => x.code === staff?.role);
    return r ? `${r.label_pl} (${r.code})` : staff?.role || "-";
  }, [roles, staff]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const list = [...resolved];
    list.sort((a, b) => a.code.localeCompare(b.code));
    if (!qq) return list;
    return list.filter(
      (a) =>
        a.code.toLowerCase().includes(qq) ||
        (a.label_pl || "").toLowerCase().includes(qq) ||
        (a.description_pl || "").toLowerCase().includes(qq)
    );
  }, [resolved, q]);

  const dirtyOverrides = useMemo(() => {
    const a = overrides;
    const b = originalOverrides;

    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const av = a[k] ?? null;
      const bv = b[k] ?? null;
      if (av !== bv) return true;
    }
    return false;
  }, [overrides, originalOverrides]);

  async function saveRole() {
    if (!staff) return;
    setError(null);
    setOk(null);
    setSaving(true);
    try {
      if (!canSetRole) throw new ApiError(403, "Brak uprawnienia: staff.role.set");

      const out = await apiFetch<StaffOut>(`/staff/${staff.id}/role`, {
        method: "PUT",
        token,
        body: { role: nextRole },
        onUnauthorized: handleUnauthorized,
      });
      setStaff(out);
      setOk("Rola zapisana. Pracownik dostanie relogin (token_version++). ✅");
      setOpenRole(false);

      await loadAll();
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd zapisu roli");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    if (!staff) return;
    setError(null);
    setOk(null);
    setSaving(true);

    try {
      if (!canUpdateProfile) throw new ApiError(403, "Brak uprawnienia: staff.update");

      const out = await apiFetch<StaffOut>(`/staff/${staff.id}`, {
        method: "PUT",
        token,
        body: {
          first_name: pFirst,
          last_name: pLast,
          email: pEmail || null,
          phone_company: pPhone || null,
          job_title: pTitle || null,
          birth_date: pBirth || null,
          pesel: pPesel || null,
          id_document_no: pDoc || null,

          // legacy
          address_registered: pAddrReg || null,
          address_current: pAddrSame ? null : pAddrCur || null,

          // structured PRG
          address_registered_prg: pAddrRegPrg || null,
          address_current_prg: pAddrSame ? null : pAddrCurPrg || null,

          address_current_same_as_registered: pAddrSame,
          mfa_required: pMfaReq,
        },
        onUnauthorized: handleUnauthorized,
      });

      setStaff(out);
      setOk("Profil zapisany ✅");
      setOpenProfile(false);

      await loadAll();
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd zapisu profilu");
    } finally {
      setSaving(false);
    }
  }

  function setOverride(code: string, value: OverrideEffect) {
    setOverrides((prev) => ({ ...prev, [code]: value }));
  }

  async function saveOverrides() {
    if (!staff) return;
    setError(null);
    setOk(null);
    setSaving(true);

    try {
      if (!canPermWrite) throw new ApiError(403, "Brak uprawnienia: staff.permissions.write");

      const patch: Record<string, OverrideEffect> = {};
      const keys = new Set([...Object.keys(overrides), ...Object.keys(originalOverrides)]);
      for (const k of keys) {
        const av = overrides[k] ?? null;
        const bv = originalOverrides[k] ?? null;
        if (av !== bv) patch[k] = av;
      }

      await apiFetch<void>(`/staff/${staff.id}/permissions`, {
        method: "PUT",
        token,
        body: { overrides: patch },
        onUnauthorized: handleUnauthorized,
      });

      setOk("Uprawnienia indywidualne zapisane ✅");
      await loadAll();
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd zapisu uprawnień");
    } finally {
      setSaving(false);
    }
  }

  if (!canOpen) {
    return <div className="text-xs text-muted-foreground">Ładuję uprawnienia…</div>;
  }

  if (!canUsePage) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">Zarządzanie pracownikiem</div>
        <div className="text-xs text-muted-foreground">Brak uprawnień do tej zakładki.</div>
        <Link
          href={`/staff/${staffId}`}
          className="inline-flex rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
        >
          ← Wróć
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Zarządzaj: {staff?.username ?? `#${staffId}`}</div>
          <div className="text-xs text-muted-foreground">
            Edycja profilu, roli i uprawnień indywidualnych. Pracownik nie ma tu wstępu.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/staff/${staffId}`}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
          >
            ← Karta
          </Link>
          <button
            onClick={() => loadAll()}
            disabled={busy || saving}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            {busy ? "Ładuję…" : "Odśwież"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-xs">{error}</div>}
      {ok && <div className="rounded-md bg-emerald-500/10 p-3 text-xs">{ok}</div>}

      {/* Profile + role */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium">Profil i rola</div>
          <div className="flex items-center gap-2 text-xs">
            {staff && (
              <>
                <Pill tone={staff.status === "active" ? "ok" : "warn"} text={staff.status} />
                <span className="text-muted-foreground">role: {staff.role}</span>
              </>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Login</div>
              <div className="text-sm font-medium">{staff?.username || "-"}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="text-sm font-medium">{staff?.email || "-"}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Rola</div>
              <div className="text-sm font-medium">{roleLabel}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canUpdateProfile && (
              <button
                onClick={() => {
                  if (staff) seedProfileForm(staff);
                  setOpenProfile(true);
                }}
                disabled={busy || saving}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
              >
                Edytuj profil
              </button>
            )}
            {canSetRole && (
              <button
                onClick={() => {
                  setNextRole(staff?.role || "");
                  setOpenRole(true);
                }}
                disabled={busy || saving}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
              >
                Zmień rolę
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Permissions */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="text-sm font-medium">Uprawnienia (rola + override)</div>
            <div className="text-xs text-muted-foreground">
              Kolejność: deny override → allow override → rola → brak.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Szukaj…"
              className="h-9 w-48 rounded-md border border-border bg-background px-3 text-sm"
            />
            {canPermWrite && (
              <button
                onClick={() => saveOverrides()}
                disabled={saving || busy || !dirtyOverrides}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
              >
                {saving ? "Zapisuję…" : "Zapisz"}
              </button>
            )}
          </div>
        </div>

        <div className="p-4">
          {!canPermRead ? (
            <div className="text-xs text-muted-foreground">Brak uprawnienia: staff.permissions.read</div>
          ) : resolved.length === 0 ? (
            <div className="text-xs text-muted-foreground">Brak danych.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Kod</th>
                    <th className="py-2 pr-3">Nazwa</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Źródło</th>
                    <th className="py-2 pr-3">Override</th>
                    {canPermWrite && <th className="py-2 pr-3">Zmień</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const ov = overrides[a.code] ?? null;
                    return (
                      <tr key={a.code} className="border-b border-border last:border-b-0">
                        <td className="py-2 pr-3 font-mono text-xs">{a.code}</td>
                        <td className="py-2 pr-3">
                          <div className="text-sm">{a.label_pl}</div>
                          <div className="text-xs text-muted-foreground">{a.description_pl}</div>
                        </td>
                        <td className="py-2 pr-3">
                          {a.allowed ? <Pill tone="ok" text="allow" /> : <Pill tone="muted" text="deny" />}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="text-xs text-muted-foreground">{a.source}</span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="text-xs">{a.override ?? "-"}</span>
                        </td>
                        {canPermWrite && (
                          <td className="py-2 pr-3">
                            <select
                              value={ov ?? "inherit"}
                              onChange={(e) => {
                                const v = e.target.value;
                                setOverride(a.code, v === "inherit" ? null : (v as OverrideEffect));
                              }}
                              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                            >
                              <option value="inherit">inherit</option>
                              <option value="allow">allow</option>
                              <option value="deny">deny</option>
                            </select>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Role modal */}
      <SimpleModal
        open={openRole}
        title="Zmień rolę"
        onClose={() => {
          if (saving) return;
          setOpenRole(false);
        }}
      >
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Zmiana roli robi token_version++ → pracownik będzie musiał zalogować się ponownie.
          </div>

          {roles.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Brak listy ról (wymagane rbac.roles.list). Możesz wpisać kod ręcznie.
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Rola (kod)</div>
            {roles.length > 0 ? (
              <select
                value={nextRole}
                onChange={(e) => setNextRole(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                {roles
                  .slice()
                  .sort((a, b) => a.label_pl.localeCompare(b.label_pl))
                  .map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label_pl} ({r.code})
                    </option>
                  ))}
              </select>
            ) : (
              <input
                value={nextRole}
                onChange={(e) => setNextRole(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                placeholder="np. admin / staff / sales / unassigned…"
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenRole(false)}
              disabled={saving}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              Anuluj
            </button>
            <button
              onClick={() => saveRole()}
              disabled={saving || !nextRole.trim()}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              {saving ? "Zapisuję…" : "Zapisz"}
            </button>
          </div>
        </div>
      </SimpleModal>

      {/* Profile modal */}
      <SimpleModal
        open={openProfile}
        title="Edytuj profil pracownika"
        // modal_staff: duży, nieprzezroczysty, ~20% margines od krawędzi (60vw/60vh)
        className="w-[min(60vw,1100px)] h-[min(60vh,820px)] max-w-none"
        bodyClassName="p-0"
        headerExtra={
          <div className="flex flex-wrap gap-2">
            <TabButton active={profileTab === "basic"} onClick={() => setProfileTab("basic")}>
              Dane podstawowe
            </TabButton>
            <TabButton active={profileTab === "reg"} onClick={() => setProfileTab("reg")}>
              Adres zameldowania
            </TabButton>
            <TabButton active={profileTab === "cur"} onClick={() => setProfileTab("cur")}>
              Adres zamieszkania
            </TabButton>
          </div>
        }
        onClose={() => {
          if (saving) return;
          setOpenProfile(false);
        }}
      >
        {/* modal_staff body */}
        <div className="flex h-full flex-col bg-card">
          {/* content */}
          <div className="flex-1 overflow-y-auto p-4">
            {profileTab === "basic" ? (
              <div className="space-y-5">
                <div className="text-xs font-semibold">Dane podstawowe</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <div className="text-xs text-muted-foreground">Imię</div>
                    <input
                      value={pFirst}
                      onChange={(e) => setPFirst(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-muted-foreground">Nazwisko</div>
                    <input
                      value={pLast}
                      onChange={(e) => setPLast(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    />
                  </label>

                  <label className="space-y-1 md:col-span-2">
                    <div className="text-xs text-muted-foreground">Email</div>
                    <input
                      value={pEmail}
                      onChange={(e) => setPEmail(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <div className="text-xs text-muted-foreground">Telefon firmowy</div>
                    <input
                      value={pPhone}
                      onChange={(e) => setPPhone(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-muted-foreground">Stanowisko</div>
                    <input
                      value={pTitle}
                      onChange={(e) => setPTitle(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    />
                  </label>
                </div>

                <div className="text-xs font-semibold">Dokumenty</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <div className="text-xs text-muted-foreground">Data urodzenia (YYYY-MM-DD)</div>
                    <input
                      value={pBirth}
                      onChange={(e) => setPBirth(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-muted-foreground">PESEL</div>
                    <input
                      value={pPesel}
                      onChange={(e) => setPPesel(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <div className="text-xs text-muted-foreground">Dowód (seria/nr)</div>
                    <input
                      value={pDoc}
                      onChange={(e) => setPDoc(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    />
                  </label>
                </div>

                <div className="text-xs font-semibold">Bezpieczeństwo</div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pMfaReq} onChange={(e) => setPMfaReq(e.target.checked)} />
                  <span>Wymagane MFA (TOTP)</span>
                </label>
              </div>
            ) : null}

            {profileTab === "reg" ? (
              <div className="space-y-4">
                <div className="text-xs font-semibold">Adres zameldowania (PRG/ADRUNI)</div>
                <div className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                  Wskazówka: wybór z PRG zapisze też „tekst / legacy”, żeby nie rozwalić zgodności wstecz.
                </div>

                <PrgAddressFinder
                  title="Adres zameldowania"
                  description="Wybierz lokalizację z PRG."
                  disabled={saving}
                  onPick={(picked) => {
                    const prg = pickToPrg(picked);
                    setPAddrRegPrg(prg);
                    setPAddrReg(formatPrgAddress(prg));

                    if (pAddrSame) {
                      setPAddrCurPrg(null);
                      setPAddrCur("");
                    }
                  }}
                />

                <label className="space-y-1 block">
                  <div className="text-xs text-muted-foreground">Adres zameldowania (tekst / legacy)</div>
                  <textarea
                    value={pAddrReg}
                    onChange={(e) => setPAddrReg(e.target.value)}
                    className="min-h-[92px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={pAddrSame}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPAddrSame(checked);
                      if (checked) {
                        setPAddrCur("");
                        setPAddrCurPrg(null);
                      }
                    }}
                  />
                  <span>Adres zamieszkania taki sam jak zameldowania</span>
                </label>
              </div>
            ) : null}

            {profileTab === "cur" ? (
              <div className="space-y-4">
                <div className="text-xs font-semibold">Adres zamieszkania (PRG/ADRUNI)</div>

                {pAddrSame ? (
                  <div className="rounded-lg border border-border bg-background/50 p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="text-sm">Taki sam jak adres zameldowania.</div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Możesz to zmienić w zakładce „Adres zameldowania”.
                    </div>
                  </div>
                ) : (
                  <>
                    <PrgAddressFinder
                      title="Adres zamieszkania"
                      description="Wybierz lokalizację z PRG dla adresu zamieszkania."
                      disabled={saving}
                      onPick={(picked) => {
                        const prg = pickToPrg(picked);
                        setPAddrCurPrg(prg);
                        setPAddrCur(formatPrgAddress(prg));
                      }}
                    />

                    <label className="space-y-1 block">
                      <div className="text-xs text-muted-foreground">Adres zamieszkania (tekst / legacy)</div>
                      <textarea
                        value={pAddrCur}
                        onChange={(e) => setPAddrCur(e.target.value)}
                        className="min-h-[92px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </label>
                  </>
                )}
              </div>
            ) : null}
          </div>

          {/* footer */}
          <div className="border-t border-border p-4 flex items-center justify-end gap-2 bg-muted/20">
            <button
              onClick={() => setOpenProfile(false)}
              disabled={saving}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              Anuluj
            </button>
            <button
              onClick={() => saveProfile()}
              disabled={saving}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              {saving ? "Zapisuję…" : "Zapisz"}
            </button>
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}