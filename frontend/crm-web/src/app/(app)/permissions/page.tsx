"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SimpleModal } from "@/components/SimpleModal";

type Role = {
  code: string;
  label_pl: string;
  description_pl: string;
};

type RoleActionRow = {
  code: string;
  label_pl: string;
  description_pl: string;
  allowed: boolean;
};

type Mode = "create" | "edit";

export default function PermissionsPage() {
  const { token, logout } = useAuth();
  const router = useRouter();

  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const [rows, setRows] = useState<RoleActionRow[]>([]);
  const [originalAllowed, setOriginalAllowed] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // modale: create/edit
  const [openRoleModal, setOpenRoleModal] = useState(false);
  const [roleMode, setRoleMode] = useState<Mode>("create");
  const [roleCode, setRoleCode] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [roleDesc, setRoleDesc] = useState("");

  // modal delete
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleUnauthorized() {
    logout();
    router.replace("/login");
  }

  async function loadRoles(preserveSelected = true) {
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      const data = await apiFetch<Role[]>("/rbac/roles", {
        method: "GET",
        token,
        onUnauthorized: handleUnauthorized,
      });
      const sorted = [...data].sort((a, b) => a.label_pl.localeCompare(b.label_pl));
      setRoles(sorted);

      if (!preserveSelected) return;

      // utrzymaj selekcję jeśli nadal istnieje
      const still = selected && sorted.some((r) => r.code === selected) ? selected : null;
      const next = still ?? (sorted[0]?.code ?? null);
      setSelected(next);
    } catch (e: any) {
      const err = e as ApiError;
      setRoles([]);
      setSelected(null);
      setRows([]);
      setOriginalAllowed(new Set());
      setError(err.message || "Nie mogę pobrać listy ról");
    } finally {
      setBusy(false);
    }
  }

  async function loadRoleActions(roleCode: string) {
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      const data = await apiFetch<RoleActionRow[]>(
        `/rbac/roles/${encodeURIComponent(roleCode)}/actions`,
        {
          method: "GET",
          token,
          onUnauthorized: handleUnauthorized,
        }
      );
      setRows(data);
      setOriginalAllowed(new Set(data.filter((x) => x.allowed).map((x) => x.code)));
    } catch (e: any) {
      const err = e as ApiError;
      setRows([]);
      setOriginalAllowed(new Set());
      setError(err.message || "Nie mogę pobrać akcji roli");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    loadRoles(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!selected) return;
    loadRoleActions(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.code === selected) ?? null,
    [roles, selected]
  );

  const currentAllowed = useMemo(
    () => new Set(rows.filter((x) => x.allowed).map((x) => x.code)),
    [rows]
  );

  const dirty = useMemo(() => {
    if (!selected) return false;
    if (currentAllowed.size !== originalAllowed.size) return true;
    for (const c of currentAllowed) if (!originalAllowed.has(c)) return true;
    return false;
  }, [selected, currentAllowed, originalAllowed]);

  function toggleAction(code: string) {
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, allowed: !r.allowed } : r)));
  }

  async function saveRoleActions() {
    if (!selected) return;
    setError(null);
    setOk(null);
    setSaving(true);
    try {
      const action_codes = Array.from(currentAllowed).sort();
      await apiFetch<void>(`/rbac/roles/${encodeURIComponent(selected)}/actions`, {
        method: "PUT",
        token,
        body: { action_codes },
        onUnauthorized: handleUnauthorized,
      });
      setOriginalAllowed(new Set(action_codes));
      setOk("Zapisano uprawnienia ✅");
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd zapisu uprawnień");
    } finally {
      setSaving(false);
    }
  }

  function openCreateRole() {
    setRoleMode("create");
    setRoleCode("");
    setRoleLabel("");
    setRoleDesc("");
    setOpenRoleModal(true);
  }

  function openEditRole() {
    if (!selectedRole) return;
    setRoleMode("edit");
    setRoleCode(selectedRole.code);
    setRoleLabel(selectedRole.label_pl);
    setRoleDesc(selectedRole.description_pl || "");
    setOpenRoleModal(true);
  }

  async function submitRole() {
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      if (roleMode === "create") {
        const out = await apiFetch<Role>("/rbac/roles", {
          method: "POST",
          token,
          body: { code: roleCode.trim(), label_pl: roleLabel.trim(), description_pl: roleDesc },
          onUnauthorized: handleUnauthorized,
        });
        await loadRoles(false);
        setSelected(out.code);
        setOk("Dodano rolę ✅");
      } else {
        const out = await apiFetch<Role>(`/rbac/roles/${encodeURIComponent(roleCode)}`, {
          method: "PUT",
          token,
          body: { label_pl: roleLabel.trim(), description_pl: roleDesc },
          onUnauthorized: handleUnauthorized,
        });
        await loadRoles(false);
        setSelected(out.code);
        setOk("Zapisano rolę ✅");
      }
      setOpenRoleModal(false);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd zapisu roli");
    } finally {
      setBusy(false);
    }
  }

  function openDeleteRole() {
    setDeleteError(null);
    setOpenDelete(true);
  }

  async function confirmDeleteRole() {
    if (!selectedRole) return;
    setDeleteError(null);
    setBusy(true);
    try {
      await apiFetch<void>(`/rbac/roles/${encodeURIComponent(selectedRole.code)}`, {
        method: "DELETE",
        token,
        onUnauthorized: handleUnauthorized,
      });
      setOpenDelete(false);
      setOk("Rola usunięta ✅");
      await loadRoles(false);

      const next =
        roles
          .filter((r) => r.code !== selectedRole.code)
          .sort((a, b) => a.label_pl.localeCompare(b.label_pl))[0]?.code ?? null;
      setSelected(next);
    } catch (e: any) {
      const err = e as ApiError;
      // backend detail leci jako message w apiFetch → pokażemy w modalu
      setDeleteError(err.message || "Nie mogę usunąć roli");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Uprawnienia</h1>
          <p className="text-sm text-muted-foreground">
            Role po lewej, akcje po prawej. Zapis zmienia mapowanie rola → akcje.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
            onClick={openCreateRole}
            type="button"
          >
            + Dodaj stanowisko
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
            onClick={openEditRole}
            type="button"
            disabled={!selectedRole}
          >
            Edytuj
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
            onClick={openDeleteRole}
            type="button"
            disabled={!selectedRole}
          >
            Usuń
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-border bg-red-500/10 p-3 text-sm">{error}</div>
      ) : null}
      {ok ? (
        <div className="rounded-lg border border-border bg-emerald-500/10 p-3 text-sm">{ok}</div>
      ) : null}

      <div className="grid grid-cols-12 gap-4">
        {/* left: roles */}
        <div className="col-span-12 md:col-span-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="text-sm font-semibold">Role / stanowiska</div>
              <button
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => loadRoles(true)}
                type="button"
              >
                odśwież
              </button>
            </div>

            <div className="p-2 space-y-1 max-h-[60vh] overflow-auto">
              {roles.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">Brak ról</div>
              ) : (
                roles.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => setSelected(r.code)}
                    className={[
                      "w-full text-left rounded-lg px-3 py-2",
                      selected === r.code ? "bg-muted/60" : "hover:bg-muted/40",
                    ].join(" ")}
                  >
                    <div className="text-sm font-medium">{r.label_pl}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.code}
                      {r.description_pl ? ` • ${r.description_pl}` : ""}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* right: actions */}
        <div className="col-span-12 md:col-span-8">
          <div className="rounded-xl border border-border bg-card">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="text-sm font-semibold">
                Akcje {selectedRole ? `— ${selectedRole.label_pl}` : ""}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-50"
                  type="button"
                  onClick={saveRoleActions}
                  disabled={!selected || !dirty || saving}
                >
                  {saving ? "Zapisuję..." : dirty ? "Zapisz" : "Zapisane"}
                </button>
              </div>
            </div>

            <div className="p-3">
              {!selected ? (
                <div className="text-sm text-muted-foreground">Wybierz rolę po lewej.</div>
              ) : rows.length === 0 ? (
                <div className="text-sm text-muted-foreground">Brak akcji do wyświetlenia.</div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
                  {rows.map((a) => (
                    <label
                      key={a.code}
                      className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={a.allowed}
                        onChange={() => toggleAction(a.code)}
                        disabled={busy}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {a.label_pl}{" "}
                          <span className="text-xs text-muted-foreground">({a.code})</span>
                        </div>
                        {a.description_pl ? (
                          <div className="text-xs text-muted-foreground">{a.description_pl}</div>
                        ) : null}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* modal create/edit */}
      <SimpleModal
        open={openRoleModal}
        title={roleMode === "create" ? "Dodaj stanowisko" : "Edytuj stanowisko"}
        description="Stanowisko = rola. Kod jest techniczny i powinien być stabilny (np. tech, billing, support)."
        onClose={() => setOpenRoleModal(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
              onClick={() => setOpenRoleModal(false)}
              disabled={busy}
            >
              Anuluj
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
              onClick={submitRole}
              disabled={busy || !roleLabel.trim() || (roleMode === "create" && !roleCode.trim())}
            >
              {busy ? "Zapisuję..." : "Zapisz"}
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          {roleMode === "create" ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Kod (unikalny)</div>
              <input
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value)}
                placeholder="np. support"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Kod</div>
              <input
                value={roleCode}
                readOnly
                className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Nazwa (PL)</div>
            <input
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              placeholder="np. Dział techniczny"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Opis</div>
            <textarea
              value={roleDesc}
              onChange={(e) => setRoleDesc(e.target.value)}
              placeholder="opcjonalnie"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[90px]"
            />
          </div>
        </div>
      </SimpleModal>

      {/* modal delete */}
      <SimpleModal
        open={openDelete}
        title="Usuń rolę"
        description={
          selectedRole
            ? `Usuwasz rolę: ${selectedRole.label_pl} (${selectedRole.code}).`
            : "Usuwasz rolę."
        }
        onClose={() => setOpenDelete(false)}
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {deleteError ? <span className="text-red-500">{deleteError}</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
                onClick={() => setOpenDelete(false)}
                disabled={busy}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                onClick={confirmDeleteRole}
                disabled={busy || !selectedRole}
              >
                {busy ? "Usuwam..." : "Usuń"}
              </button>
            </div>
          </div>
        }
      >
        <div className="text-sm">
          {deleteError ? (
            <div className="rounded-md border border-border bg-red-500/10 p-3">{deleteError}</div>
          ) : (
            <div className="rounded-md border border-border bg-muted/20 p-3">
              Backend może odmówić (np. rola używana albo blokady admina). Jeśli tak — zobaczysz komunikat.
            </div>
          )}
        </div>
      </SimpleModal>
    </div>
  );
}
