"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";

type StaffOut = {
  id: number;
  username: string;
  email?: string | null;
  role: string;
  status: string;
  must_change_credentials: boolean;
  mfa_required: boolean;

  // profile (opcjonalne — dziś mogą być puste)
  first_name?: string | null;
  last_name?: string | null;
  phone_company?: string | null;
  job_title?: string | null;
  birth_date?: string | null;
  pesel?: string | null;
  id_document_no?: string | null;
  address_registered?: string | null;
  address_current?: string | null;
  address_current_same_as_registered?: boolean;
};

type WhoAmI = {
  staff_id: number;
  username: string;
  role: string;
  bootstrap_mode: boolean;
  setup_mode: boolean;
};

function Badge({ status }: { status: string }) {
  const base =
    "inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] leading-4";
  const tone =
    status === "active"
      ? "bg-emerald-500/10"
      : status === "disabled"
      ? "bg-amber-500/10"
      : status === "archived"
      ? "bg-slate-500/10"
      : "bg-muted/40";
  return <span className={`${base} ${tone}`}>{status}</span>;
}

function FieldRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 py-2 border-b border-border last:border-b-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="md:col-span-2 text-sm">{value && value.trim() ? value : "-"}</div>
    </div>
  );
}

export default function StaffDetailsPage() {
  const { token, logout } = useAuth();
  const perms = usePermissions();
  const router = useRouter();
  const params = useParams();
  const staffId = Number(params?.id);

  const [me, setMe] = useState<WhoAmI | null>(null);
  const [u, setU] = useState<StaffOut | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function handleUnauthorized() {
    logout();
    router.replace("/login");
  }

  async function loadMe(): Promise<WhoAmI | null> {
    try {
      const data = await apiFetch<WhoAmI>("/identity/whoami", {
        method: "GET",
        token,
        onUnauthorized: handleUnauthorized,
      });
      setMe(data);
      return data;
    } catch {
      setMe(null);
      return null;
    }
  }

  async function load() {
    setError(null);
    setToast(null);
    setBusy(true);

    try {
      const who = me ?? (await loadMe());
      if (!who) {
        setU(null);
        return;
      }

      // staff bez uprawnień zobaczy siebie przez /staff/self
      if (who.staff_id === staffId) {
        const data = await apiFetch<StaffOut>("/staff/self", {
          method: "GET",
          token,
          onUnauthorized: handleUnauthorized,
        });
        setU(data);
        return;
      }

      // admin/uprawniony: /staff/{id}
      if (!perms.has("staff.read")) {
        throw new ApiError(403, "Brak uprawnienia: staff.read");
      }
      const data = await apiFetch<StaffOut>(`/staff/${staffId}`, {
        method: "GET",
        token,
        onUnauthorized: handleUnauthorized,
      });
      setU(data);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd pobierania danych pracownika");
      setU(null);
    } finally {
      setBusy(false);
    }
  }

  async function postAction(path: string, okMsg: string) {
    setError(null);
    setToast(null);
    setBusy(true);
    try {
      await apiFetch<void>(path, {
        method: "POST",
        token,
        onUnauthorized: handleUnauthorized,
      });
      setToast(okMsg);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd operacji");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (token && Number.isFinite(staffId)) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, staffId]);

  const canManage = perms.hasAny([
    "staff.update",
    "staff.role.set",
    "staff.permissions.read",
    "staff.permissions.write",
    "staff.reset_password",
    "staff.reset_totp",
  ]);
  const isSelf = me?.staff_id === staffId;

  const fullName = useMemo(() => {
    const fn = (u?.first_name || "").trim();
    const ln = (u?.last_name || "").trim();
    const combo = `${ln} ${fn}`.trim();
    return combo || u?.username || `#${staffId}`;
  }, [u, staffId]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Pracownik: {fullName}</div>
          <div className="text-xs text-muted-foreground">
            Self-service (hasło/TOTP/email) jest w "Moje konto". Zarządzanie pracownikiem wymaga uprawnień.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/staff"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
          >
            ← Lista
          </Link>

          <button
            onClick={() => load()}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            {busy ? "Ładuję..." : "Odśwież"}
          </button>
        </div>
      </div>

      {/* Top actions */}
      <div className="flex flex-wrap items-center gap-2">
        {isSelf && (
          <Link
            href="/settings"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
          >
            Moje konto
          </Link>
        )}

        {canManage && !isSelf && (
          <Link
            href={`/staff/${staffId}/permission`}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
          >
            Zarządzaj
          </Link>
        )}

        {!isSelf && perms.has("staff.reset_password") && (
          <button
            onClick={() => postAction(`/staff/${staffId}/reset-password`, "Hasło zresetowane (mail best-effort).")}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            Resetuj hasło
          </button>
        )}

        {!isSelf && perms.has("staff.reset_totp") && (
          <button
            onClick={() => postAction(`/staff/${staffId}/reset-totp`, "TOTP zresetowane. Przy następnym logowaniu będzie setup.")}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            Resetuj TOTP
          </button>
        )}
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-xs">{error}</div>}
      {toast && <div className="rounded-md bg-emerald-500/10 p-3 text-xs">{toast}</div>}

      {/* Card */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium">Dane</div>
          <div className="flex items-center gap-2 text-xs">
            {u && (
              <>
                <Badge status={u.status} />
                <span className="text-muted-foreground">role: {u.role}</span>
              </>
            )}
          </div>
        </div>

        <div className="p-4">
          {busy && !u ? (
            <div className="text-xs text-muted-foreground">Ładowanie…</div>
          ) : !u ? (
            <div className="text-xs text-muted-foreground">Brak danych.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4">
                <div className="text-xs font-semibold mb-2">Podstawowe</div>
                <FieldRow label="Imię" value={u.first_name || ""} />
                <FieldRow label="Nazwisko" value={u.last_name || ""} />
                <FieldRow label="Login" value={u.username} />
                <FieldRow label="Email" value={u.email || ""} />
                <FieldRow label="Telefon firmowy" value={u.phone_company || ""} />
                <FieldRow label="Stanowisko" value={u.job_title || ""} />
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="text-xs font-semibold mb-2">Identyfikacja</div>
                <FieldRow label="Data urodzenia" value={u.birth_date || ""} />
                <FieldRow label="PESEL" value={u.pesel || ""} />
                <FieldRow label="Seria/Nr dowodu" value={u.id_document_no || ""} />
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="text-xs font-semibold mb-2">Adresy</div>
                <FieldRow label="Adres zameldowania" value={u.address_registered || ""} />
                <FieldRow
                  label="Adres zamieszkania"
                  value={
                    u.address_current_same_as_registered
                      ? "(taki sam jak zameldowania)"
                      : u.address_current || ""
                  }
                />
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="text-xs font-semibold mb-2">Bezpieczeństwo</div>
                <FieldRow
                  label="Wymuszona zmiana hasła"
                  value={u.must_change_credentials ? "tak" : "nie"}
                />
                <FieldRow
                  label="Wymagane MFA"
                  value={u.mfa_required ? "tak" : "nie"}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}