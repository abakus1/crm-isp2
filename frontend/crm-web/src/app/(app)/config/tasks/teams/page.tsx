"use client";

import { useMemo, useState } from "react";

import { seedAutoTaskCategories, seedTaskTeams } from "@/lib/mockTaskConfig";
import { getStaffLabel, seedTaskStaff } from "@/lib/mockTasks";

export default function TaskTeamsConfigPage() {
  const staff = useMemo(() => seedTaskStaff(), []);
  const [categories, setCategories] = useState(() => seedAutoTaskCategories());
  const [teams, setTeams] = useState(() => seedTaskTeams());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [taskCodes, setTaskCodes] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);

  const visibleTeams = showInactive ? teams : teams.filter((team) => team.active);
  const activeCategories = categories.filter((category) => category.active);

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setMemberIds([]);
    setTaskCodes([]);
    setFormActive(true);
  }

  function toggle<T extends string>(items: T[], setItems: (next: T[]) => void, value: T) {
    setItems(items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);
  }

  function submitTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || memberIds.length === 0) return;

    if (editingId) {
      setTeams((prev) =>
        prev.map((team) =>
          team.id === editingId
            ? {
                ...team,
                name: name.trim(),
                description: description.trim() || "Ekipa bez dodatkowego opisu.",
                memberStaffIds: memberIds,
                supportedAutoTaskCodes: taskCodes as any,
                active: formActive,
              }
            : team,
        ),
      );
      resetForm();
      return;
    }

    setTeams((prev) => [
      {
        id: `team_ui_${Date.now()}`,
        name: name.trim(),
        description: description.trim() || "Nowa ekipa z mockowego formularza.",
        memberStaffIds: memberIds,
        supportedAutoTaskCodes: taskCodes as any,
        active: formActive,
      },
      ...prev,
    ]);
    resetForm();
  }

  function startEdit(teamId: string) {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    setEditingId(team.id);
    setName(team.name);
    setDescription(team.description);
    setMemberIds(team.memberStaffIds);
    setTaskCodes(team.supportedAutoTaskCodes);
    setFormActive(team.active);
  }

  function toggleTeamActive(teamId: string) {
    setTeams((prev) => prev.map((team) => (team.id === teamId ? { ...team, active: !team.active } : team)));
    if (editingId === teamId) {
      setFormActive((prev) => !prev);
    }
    setCategories((prev) =>
      prev.map((category) => ({
        ...category,
        eligibleTeamIds: category.eligibleTeamIds.filter((id) => id !== teamId || teams.find((team) => team.id === teamId)?.active),
      })),
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → Zadania → Zespoły</div>
        <div className="text-xs text-muted-foreground">
          Tu pilnujemy, żeby ekipy nie znikały z historii jak skarpety po praniu. W systemie zostają, ale można je bezpiecznie wyłączyć z nowych przydziałów.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">{editingId ? "Edytuj ekipę" : "Dodaj ekipę"}</div>
            {editingId ? (
              <button type="button" onClick={resetForm} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                Anuluj edycję
              </button>
            ) : null}
          </div>

          <form className="mt-4 space-y-3" onSubmit={submitTeam}>
            <label className="block space-y-1.5">
              <div className="text-sm font-medium">Nazwa</div>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="np. Ekipa monterska 2" />
            </label>

            <label className="block space-y-1.5">
              <div className="text-sm font-medium">Opis</div>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Do czego system może używać tej ekipy automatycznie…" />
            </label>

            <label className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
              <span>Ekipa aktywna i możliwa do użycia w nowych zadaniach</span>
            </label>

            <div className="space-y-2">
              <div className="text-sm font-medium">Pracownicy</div>
              {staff.map((member) => (
                <label key={member.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={memberIds.includes(member.id)} onChange={() => toggle(memberIds, setMemberIds, member.id)} />
                  <span>
                    <span className="font-medium">{member.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {member.team} · {member.role}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Aktywne kategorie automatyczne obsługiwane przez system</div>
              {activeCategories.map((category) => (
                <label key={category.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={taskCodes.includes(category.code)} onChange={() => toggle(taskCodes, setTaskCodes, category.code)} />
                  <span>
                    <span className="font-medium">{category.name}</span>
                    <span className="block text-xs text-muted-foreground">{category.description}</span>
                  </span>
                </label>
              ))}
              {!activeCategories.length ? <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">Brak aktywnych kategorii — najpierw trzeba je włączyć w konfiguracji kategorii.</div> : null}
            </div>

            <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50" disabled={!name.trim() || memberIds.length === 0}>
              {editingId ? "Zapisz zmiany" : "Dodaj ekipę"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">Ekipy w systemie</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              <span>Pokaż zdeaktywowane</span>
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {visibleTeams.map((team) => (
              <div key={team.id} className={`rounded-xl border p-4 ${editingId === team.id ? "border-primary ring-1 ring-primary/30" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{team.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{team.description}</div>
                  </div>
                  <span className="rounded-md border px-2 py-1 text-xs">{team.active ? "aktywna" : "nieaktywna"}</span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Członkowie</div>
                    <div className="mt-1 text-sm font-medium">{getStaffLabel(team.memberStaffIds)}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Automatyczne kategorie</div>
                    <div className="mt-1 text-sm font-medium">{team.supportedAutoTaskCodes.join(", ") || "brak"}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(team.id)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                    Edytuj
                  </button>
                  <button type="button" onClick={() => toggleTeamActive(team.id)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                    {team.active ? "Dezaktywuj" : "Aktywuj"}
                  </button>
                </div>
              </div>
            ))}
            {!visibleTeams.length ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Brak ekip do wyświetlenia dla obecnego filtra.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
