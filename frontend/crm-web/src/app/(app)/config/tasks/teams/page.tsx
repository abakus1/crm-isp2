"use client";

import { useMemo, useState } from "react";

import { seedAutoTaskCategories, seedTaskTeams, type AutoTaskCode, type MockTaskTeam } from "@/lib/mockTaskConfig";
import { getStaffLabel, seedTaskStaff } from "@/lib/mockTasks";

type TeamFormState = {
  id: string | null;
  name: string;
  description: string;
  memberIds: string[];
  taskCodes: AutoTaskCode[];
  active: boolean;
};

const emptyForm: TeamFormState = {
  id: null,
  name: "",
  description: "",
  memberIds: [],
  taskCodes: [],
  active: true,
};

export default function TaskTeamsConfigPage() {
  const staff = useMemo(() => seedTaskStaff(), []);
  const categories = useMemo(() => seedAutoTaskCategories(), []);
  const [teams, setTeams] = useState<MockTaskTeam[]>(() => seedTaskTeams());
  const [form, setForm] = useState<TeamFormState>(emptyForm);

  const editingTeam = useMemo(() => teams.find((team) => team.id === form.id) ?? null, [form.id, teams]);

  function toggle<T extends string>(items: T[], value: T) {
    return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
  }

  function updateForm<K extends keyof TeamFormState>(key: K, value: TeamFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
  }

  function startEdit(team: MockTaskTeam) {
    setForm({
      id: team.id,
      name: team.name,
      description: team.description,
      memberIds: [...team.memberStaffIds],
      taskCodes: [...team.supportedAutoTaskCodes],
      active: team.active,
    });
  }

  function submitTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || form.memberIds.length === 0) return;

    const payload: MockTaskTeam = {
      id: form.id ?? `team_ui_${Date.now()}`,
      name: form.name.trim(),
      description: form.description.trim() || "Nowa ekipa z mockowego formularza.",
      memberStaffIds: form.memberIds,
      supportedAutoTaskCodes: form.taskCodes,
      active: form.active,
    };

    setTeams((prev) => {
      if (form.id) {
        return prev.map((team) => (team.id === form.id ? payload : team));
      }
      return [payload, ...prev];
    });

    resetForm();
  }

  function removeTeam(teamId: string) {
    setTeams((prev) => prev.filter((team) => team.id !== teamId));
    if (form.id === teamId) {
      resetForm();
    }
  }

  function toggleTeamActive(teamId: string) {
    setTeams((prev) => prev.map((team) => (team.id === teamId ? { ...team, active: !team.active } : team)));
    if (form.id === teamId && editingTeam) {
      updateForm("active", !editingTeam.active);
    }
  }

  const submitLabel = form.id ? "Zapisz zmiany (mock)" : "Utwórz ekipę (mock)";

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → Zadania → Zespoły</div>
        <div className="text-xs text-muted-foreground">
          Zadanie przypisane do ekipy ma być widoczne wszystkim członkom. Źródłem przypisania pozostaje zespół, a nie 17 ręcznych kopii tego samego bloku. Cyfrowe gobliny dalej tego nie lubią.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{form.id ? "Edytuj ekipę" : "Utwórz ekipę"}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {form.id ? "Masz tryb edycji, więc zapis nadpisze wybraną ekipę zamiast tworzyć dubla-chaosa." : "Nowa ekipa może obsługiwać zadania automatyczne i być przypisywana w kalendarzu."}
              </div>
            </div>
            {form.id ? (
              <button type="button" onClick={resetForm} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/40">
                Anuluj edycję
              </button>
            ) : null}
          </div>

          <form className="mt-4 space-y-3" onSubmit={submitTeam}>
            <label className="block space-y-1.5">
              <div className="text-sm font-medium">Nazwa</div>
              <input
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="np. Ekipa monterska 2"
              />
            </label>

            <label className="block space-y-1.5">
              <div className="text-sm font-medium">Opis</div>
              <textarea
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Do czego system może używać tej ekipy automatycznie…"
              />
            </label>

            <label className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={() => updateForm("active", !form.active)}
              />
              <span>
                <span className="font-medium">Ekipa aktywna</span>
                <span className="block text-xs text-muted-foreground">Możesz od razu ustawić status bez wchodzenia w osobny ekran.</span>
              </span>
            </label>

            <div className="space-y-2">
              <div className="text-sm font-medium">Pracownicy</div>
              {staff.map((member) => (
                <label key={member.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.memberIds.includes(member.id)}
                    onChange={() => updateForm("memberIds", toggle(form.memberIds, member.id))}
                  />
                  <span>
                    <span className="font-medium">{member.name}</span>
                    <span className="block text-xs text-muted-foreground">{member.team} · {member.role}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Kategorie automatyczne obsługiwane przez system</div>
              {categories.map((category) => (
                <label key={category.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.taskCodes.includes(category.code)}
                    onChange={() => updateForm("taskCodes", toggle(form.taskCodes, category.code) as AutoTaskCode[])}
                  />
                  <span>
                    <span className="font-medium">{category.name}</span>
                    <span className="block text-xs text-muted-foreground">{category.description}</span>
                  </span>
                </label>
              ))}
            </div>

            <button
              type="submit"
              className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
              disabled={!form.name.trim() || form.memberIds.length === 0}
            >
              {submitLabel}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Aktualne ekipy</div>
            <div className="text-xs text-muted-foreground">Łącznie: {teams.length}</div>
          </div>

          <div className="mt-4 space-y-3">
            {teams.map((team) => {
              const isEditing = form.id === team.id;
              return (
                <div key={team.id} className={`rounded-xl border p-4 ${isEditing ? "border-primary/50 bg-primary/5" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold">{team.name}</div>
                        {isEditing ? <span className="rounded-md border px-2 py-0.5 text-[11px]">edytowana</span> : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{team.description}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border px-2 py-1 text-xs">{team.active ? "aktywna" : "nieaktywna"}</span>
                      <button type="button" onClick={() => startEdit(team)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/40">
                        Edytuj
                      </button>
                      <button type="button" onClick={() => toggleTeamActive(team.id)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/40">
                        {team.active ? "Dezaktywuj" : "Aktywuj"}
                      </button>
                      <button type="button" onClick={() => removeTeam(team.id)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/40">
                        Usuń
                      </button>
                    </div>
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
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
