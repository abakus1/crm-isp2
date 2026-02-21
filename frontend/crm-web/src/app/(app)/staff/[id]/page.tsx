"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";

type StaffAddressPrg = {
  place_name?: string | null;
  terc?: string | null;
  simc?: string | null;
  street_name?: string | null;
  ulic?: string | null;
  building_no?: string | null;
  local_no?: string | null;
  postal_code?: string | null;
  post_city?: string | null;
};

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

  // legacy (utrzymujemy)
  address_registered?: string | null;
  address_current?: string | null;

  // ✅ PRG canon (backend już to zwraca)
  address_registered_prg?: StaffAddressPrg | null;
  address_current_prg?: StaffAddressPrg | null;

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

function AddressSummary({
  prg,
  legacy,
}: {
  prg?: StaffAddressPrg | null;
  legacy?: string | null;
}) {
  const place = (prg?.place_name || "").trim();
  const street = (prg?.street_name || "").trim();
  const bno = (prg?.building_no || "").trim();
  const lno = (prg?.local_no || "").trim();
  const pc = (prg?.postal_code || "").trim();
  const postCity = (prg?.post_city || "").trim();

  const hasStructured = Boolean(place || street || bno || lno || pc || postCity);

  const line1 = [place, street].filter(Boolean).join(", ").trim();
  const line2 = [bno ? `Budynek ${bno}` : null, lno ? `Lokal ${lno}` : null].filter(Boolean).join(", ");
  const line3 = [pc, postCity].filter(Boolean).join(" ").trim();

  if (hasStructured) {
    return (
      <div className="space-y-1">
        <div className="text-sm">{line1 || "-"}</div>
        {(line2 || line3) && (
          <div className="text-xs text-muted-foreground">
            {[line2, line3].filter(Boolean).join(" • ")}
          </div>
        )}
      </div>
    );
  }

  // fallback na legacy string
  return <div className="text-sm">{legacy && legacy.trim() ? legacy : "-"}</div>;
}

function AddressFields({ prg }: { prg?: StaffAddressPrg | null }) {
  if (!prg) {
    return (
      <div className="text-xs text-muted-foreground">
        Brak danych PRG dla tego adresu (jeszcze). Edycja w “Zarządzaj”.
      </div>
    );
  }

  const any =
    prg.place_name ||
    prg.street_name ||
    prg.building_no ||
    prg.local_no ||
    prg.postal_code ||
    prg.post_city ||
    prg.terc ||
    prg.simc ||
    prg.ulic;

  if (!any) {
    return (
      <div className="text-xs text-muted-foreground">
        Dane PRG puste. Edycja w “Zarządzaj”.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/20 p-3 space-y-1">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="text-muted-foreground">Miejscowość</div>
        <div className="md:col-span-2">{prg.place_name || "-"}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="text-muted-foreground">Ulica</div>
        <div className="md:col-span-2">{prg.street_name || "-"}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="text-muted-foreground">Numer budynku</div>
        <div className="md:col-span-2">{prg.building_no || "-"}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="text-muted-foreground">Numer lokalu</div>
        <div className="md:col-span-2">{prg.local_no || "-"}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="text-muted-foreground">Kod pocztowy</div>
        <div className="md:col-span-2">{prg.postal_code || "-"}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="text-muted-foreground">Miasto (poczta)</div>
        <div className="md:col-span-2">{prg.post_city || "-"}</div>
      </div>

      <div className="pt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-muted-foreground">
        <div>Kody TERYT</div>
        <div className="md:col-span-2">
          {[prg.terc ? `TERC: ${prg.terc}` : null, prg.simc ? `SIMC: ${prg.simc}` : null, prg.ulic ? `ULIC: ${prg.ulic}` : null]
            .filter(Boolean)
            .join(" • ") || "-"}
        </div>
      </div>
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
    if (!token || !Number.isFinite(staffId)) return;

    setError(null);
    setToast(null);
    setBusy(true);
    try {
      const who = await loadMe();

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

  async function postAction(path: string, okMsg: string, body?: any) {
    setError(null);
    setToast(null);
    setBusy(true);
    try {
      await apiFetch<void>(path, {
        method: "POST",
        token,
        onUnauthorized: handleUnauthorized,
        body: body ?? undefined,
      });
      setToast(okMsg);
      await load();
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

  const isSelf = me?.staff_id === staffId;

  // RBAC: zarządzanie (profil/rola/uprawnienia/reset) tylko jeśli user ma odpowiednie akcje.
  // Self-edit profilu może być dopuszczone osobnym uprawnieniem staff.update.self.
  const canManage = perms.hasAny([
    "staff.update",
    ...(isSelf ? (["staff.update.self"] as const) : []),
    "staff.role.set",
    "staff.permissions.read",
    "staff.permissions.write",
    "staff.reset_password",
    "staff.reset_totp",
  ]);

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

        {canManage && (
          <Link
            href={`/staff/${staffId}/permission`}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
          >
            Zarządzaj
          </Link>
        )}

        {perms.has("activity.read_all") && (
          <Link
            href={`/staff/${staffId}/operations`}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
          >
            Operacje
          </Link>
        )}

        {perms.has("staff.disable") && u?.status === "active" && (
          <button
            onClick={() => postAction(`/staff/${staffId}/disable`, "Zablokowano pracownika")}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            Zablokuj
          </button>
        )}

        {perms.has("staff.enable") && u?.status === "disabled" && (
          <button
            onClick={() => postAction(`/staff/${staffId}/enable`, "Odblokowano pracownika")}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            Odblokuj
          </button>
        )}

        {perms.has("staff.archive") && u?.status === "disabled" && (
          <button
            onClick={() =>
              postAction(
                `/staff/${staffId}/archive`,
                "Przeniesiono pracownika do archiwum",
                { reason: null }
              )
            }
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            title="Do archiwum można przenieść tylko zablokowanego pracownika"
          >
            Archiwizuj
          </button>
        )}

        {perms.has("staff.unarchive") && u?.status === "archived" && (
          <button
            onClick={() => postAction(`/staff/${staffId}/unarchive`, "Przywrócono pracownika (status: disabled)")}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            title="Przywraca pracownika z archiwum do statusu disabled (bez logowania)"
          >
            Przywróć z archiwum
          </button>
        )}
      </div>

      {/* Content */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="text-sm font-semibold">Dane</div>
          <div className="flex items-center gap-2">
            {u?.status && <Badge status={u.status} />}
            <span className="text-xs text-muted-foreground">role: {u?.role || "-"}</span>
          </div>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
              {error}
            </div>
          )}
          {toast && (
            <div className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
              {toast}
            </div>
          )}

          {!u ? (
            <div className="text-sm text-muted-foreground">
              {busy ? "Ładuję..." : "Brak danych"}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

              <div className="rounded-lg border border-border p-4 lg:col-span-2">
                <div className="text-xs font-semibold mb-2">Adresy</div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Zameldowanie</div>
                    <div className="mt-1">
                      <AddressSummary prg={u.address_registered_prg} legacy={u.address_registered} />
                      <AddressFields prg={u.address_registered_prg} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Zamieszkanie</div>
                    <div className="mt-1">
                      <AddressSummary prg={u.address_current_prg} legacy={u.address_current} />
                      <AddressFields prg={u.address_current_prg} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 lg:col-span-2">
                <div className="text-xs font-semibold mb-2">Bezpieczeństwo</div>
                <FieldRow label="must_change_credentials" value={String(u.must_change_credentials)} />
                <FieldRow label="mfa_required" value={String(u.mfa_required)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}