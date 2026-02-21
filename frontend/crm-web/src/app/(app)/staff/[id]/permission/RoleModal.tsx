"use client";

import { SimpleModal } from "@/components/SimpleModal";
import type { Role } from "./types";

export function RoleModal({
  open,
  onClose,
  saving,
  roles,
  nextRole,
  setNextRole,
  saveRole,
}: {
  open: boolean;
  onClose: () => void;
  saving: boolean;
  roles: Role[];
  nextRole: string;
  setNextRole: (v: string) => void;
  saveRole: () => Promise<void>;
}) {
  return (
    <SimpleModal
      open={open}
      title="Zmień rolę"
      onClose={() => {
        if (saving) return;
        onClose();
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
            onClick={onClose}
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
  );
}