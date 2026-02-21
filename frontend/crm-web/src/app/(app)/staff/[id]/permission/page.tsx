// frontend/crm-web/src/app/(app)/staff/[id]/permission/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";

import { formatPrgAddress } from "./addressUtils";
import { PermissionsPanel } from "./PermissionsPanel";
import { ProfileModal } from "./ProfileModal";
import { RoleModal } from "./RoleModal";
import type { OverrideEffect, ResolvedAction, Role, StaffAddressPrg, StaffOut } from "./types";
import { Pill } from "./ui";

export default function StaffManagePage() {
  const { token, logout } = useAuth();
  const perms = usePermissions();
  const router = useRouter();
  const params = useParams();
  const staffId = Number(params?.id);

  const [staff, setStaff] = useState<StaffOut | null>(null);
  const [meStaffId, setMeStaffId] = useState<number | null>(null);
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

  // czy legacy jest "auto" (z PRG)
  const [regLegacyAuto, setRegLegacyAuto] = useState(true);
  const [curLegacyAuto, setCurLegacyAuto] = useState(true);

  // PRG structured
  const [pAddrRegPrg, setPAddrRegPrg] = useState<StaffAddressPrg | null>(null);
  const [pAddrCurPrg, setPAddrCurPrg] = useState<StaffAddressPrg | null>(null);

  const [pAddrSame, setPAddrSame] = useState(true);
  const [pMfaReq, setPMfaReq] = useState(true);

  // permissions edit
  const [q, setQ] = useState("");
  const [overrides, setOverrides] = useState<Record<string, OverrideEffect>>({});
  const [originalOverrides, setOriginalOverrides] = useState<Record<string, OverrideEffect>>({});

  // UI: permissions collapsed by default
  const [showPermissions, setShowPermissions] = useState(false);

  function handleUnauthorized() {
    logout();
    router.replace("/login");
  }

  const canOpen = perms.loaded;
  const canReadStaff = perms.has("staff.read");
  const canUpdateProfile = perms.has("staff.update");
  const canUpdateSelf = perms.has("staff.update.self");
  const canSetRole = perms.has("staff.role.set");
  const canPermRead = perms.has("staff.permissions.read");
  const canPermWrite = perms.has("staff.permissions.write");

  const canUsePage =
    canReadStaff && (canUpdateProfile || canSetRole || canPermRead || canPermWrite);

  function syncLegacyIfAuto(which: "reg" | "cur", prg: StaffAddressPrg | null) {
    const formatted = formatPrgAddress(prg);
    if (which === "reg") {
      if (regLegacyAuto) setPAddrReg(formatted);
    } else {
      if (curLegacyAuto) setPAddrCur(formatted);
    }
  }

  function updateRegPrg(patch: Partial<StaffAddressPrg>) {
    setPAddrRegPrg((prev) => {
      const next = { ...(prev || ({} as StaffAddressPrg)), ...patch } as StaffAddressPrg;
      if (!next.place_name || !next.street_name || !next.building_no) return next;
      syncLegacyIfAuto("reg", next);
      return next;
    });
  }

  function updateCurPrg(patch: Partial<StaffAddressPrg>) {
    setPAddrCurPrg((prev) => {
      const next = { ...(prev || ({} as StaffAddressPrg)), ...patch } as StaffAddressPrg;
      if (!next.place_name || !next.street_name || !next.building_no) return next;
      syncLegacyIfAuto("cur", next);
      return next;
    });
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

    const regPrg = u.address_registered_prg || null;
    const curPrg = u.address_current_prg || null;

    setPAddrRegPrg(regPrg);
    setPAddrCurPrg(curPrg);

    setPAddrReg(u.address_registered || formatPrgAddress(regPrg) || "");
    setPAddrCur(u.address_current || formatPrgAddress(curPrg) || "");

    setRegLegacyAuto(!(u.address_registered && u.address_registered.trim().length > 0) ? true : false);
    setCurLegacyAuto(!(u.address_current && u.address_current.trim().length > 0) ? true : false);

    setPAddrSame(!!u.address_current_same_as_registered);
    setPMfaReq(!!u.mfa_required);
    setProfileTab("basic");
  }

  async function loadAll() {
    if (!token || !Number.isFinite(staffId)) return;

    setError(null);
    setOk(null);
    setBusy(true);

    try {
      if (!canReadStaff) throw new ApiError(403, "Brak uprawnienia: staff.read");

      // whoami (do rozróżnienia self vs admin edit)
      try {
        const who = await apiFetch<{ staff_id: number }>("/identity/whoami", {
          method: "GET",
          token,
          onUnauthorized: handleUnauthorized,
        });
        setMeStaffId(who?.staff_id ?? null);
      } catch {
        setMeStaffId(null);
      }

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

  function setOverride(code: string, value: OverrideEffect) {
    setOverrides((prev) => ({ ...prev, [code]: value }));
  }

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
      // Ustalamy czy edytujemy siebie. Backend ma osobny self-edit (/staff/me),
      // który nie przyjmuje pól administracyjnych (np. mfa_required).
      const who = await apiFetch<{ staff_id: number }>("/identity/whoami", {
        method: "GET",
        token,
        onUnauthorized: handleUnauthorized,
      });
      const isSelf = who?.staff_id === staff.id;

      if (isSelf) {
        if (!canUpdateSelf && !canUpdateProfile) {
          throw new ApiError(403, "Brak uprawnienia: staff.update.self");
        }
      } else {
        if (!canUpdateProfile) throw new ApiError(403, "Brak uprawnienia: staff.update");
      }

      const endpoint = isSelf ? "/staff/me" : `/staff/${staff.id}`;
      const body: any = {
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
      };

      // tylko adminowy edit przyjmuje mfa_required
      if (!isSelf) body.mfa_required = pMfaReq;

      const out = await apiFetch<StaffOut>(endpoint, {
        method: "PUT",
        token,
        body,
        onUnauthorized: handleUnauthorized,
      });

      setStaff(out);
      setOpenProfile(false);

      // ✅ po zapisie wracamy do kartoteki
      router.push(`/staff/${staff.id}`);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd zapisu profilu");
    } finally {
      setSaving(false);
    }
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

            {canPermRead && (
              <button
                type="button"
                onClick={() => setShowPermissions((v) => !v)}
                disabled={busy || saving}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
                title="Pokaż/ukryj uprawnienia indywidualne"
              >
                {showPermissions ? "Ukryj uprawnienia" : "Uprawnienia"}
                {dirtyOverrides ? " *" : ""}
              </button>
            )}
          </div>
        </div>
      </div>

      <PermissionsPanel
        show={showPermissions}
        onClose={() => setShowPermissions(false)}
        canPermRead={canPermRead}
        canPermWrite={canPermWrite}
        saving={saving}
        busy={busy}
        q={q}
        setQ={setQ}
        resolved={resolved}
        filtered={filtered}
        overrides={overrides}
        dirtyOverrides={dirtyOverrides}
        setOverride={setOverride}
        saveOverrides={saveOverrides}
      />

      <RoleModal
        open={openRole}
        onClose={() => setOpenRole(false)}
        saving={saving}
        roles={roles}
        nextRole={nextRole}
        setNextRole={setNextRole}
        saveRole={saveRole}
      />

      <ProfileModal
        open={openProfile}
        onClose={() => setOpenProfile(false)}
        saving={saving}
        profileTab={profileTab}
        setProfileTab={setProfileTab}
        pFirst={pFirst}
        setPFirst={setPFirst}
        pLast={pLast}
        setPLast={setPLast}
        pEmail={pEmail}
        setPEmail={setPEmail}
        pPhone={pPhone}
        setPPhone={setPPhone}
        pTitle={pTitle}
        setPTitle={setPTitle}
        pBirth={pBirth}
        setPBirth={setPBirth}
        pPesel={pPesel}
        setPPesel={setPPesel}
        pDoc={pDoc}
        setPDoc={setPDoc}
        pMfaReq={pMfaReq}
        setPMfaReq={setPMfaReq}
        mfaDisabled={meStaffId !== null && staff?.id === meStaffId}
        pAddrReg={pAddrReg}
        setPAddrReg={setPAddrReg}
        pAddrCur={pAddrCur}
        setPAddrCur={setPAddrCur}
        regLegacyAuto={regLegacyAuto}
        setRegLegacyAuto={setRegLegacyAuto}
        curLegacyAuto={curLegacyAuto}
        setCurLegacyAuto={setCurLegacyAuto}
        pAddrRegPrg={pAddrRegPrg}
        setPAddrRegPrg={setPAddrRegPrg}
        pAddrCurPrg={pAddrCurPrg}
        setPAddrCurPrg={setPAddrCurPrg}
        pAddrSame={pAddrSame}
        setPAddrSame={setPAddrSame}
        updateRegPrg={updateRegPrg}
        updateCurPrg={updateCurPrg}
        saveProfile={saveProfile}
      />
    </div>
  );
}