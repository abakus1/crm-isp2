"use client";

import { useMemo, useState } from "react";

import { seedAutoTaskCategories, seedTaskTeams } from "@/lib/mockTaskConfig";
import { getStaffLabel, seedTaskStaff } from "@/lib/mockTasks";

export default function TaskTeamsConfigPage() {
  const staff = useMemo(() => seedTaskStaff(), []);
  const categories = useMemo(() => seedAutoTaskCategories(), []);
  const [teams, setTeams] = useState(() => seedTaskTeams());
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [taskCodes, setTaskCodes] = useState<string[]>([]);

  function toggle<T extends string>(items: T[], setItems: (next: T[]) => void, value: T) {
    setItems(items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);
  }

  function createTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || memberIds.length === 0) return;
    setTeams((prev) => [
      {
        id: `team_ui_${Date.now()}`,
        name: name.trim(),
        description: description.trim() || "Nowa ekipa z mockowego formularza.",
        memberStaffIds: memberIds,
        supportedAutoTaskCodes: taskCodes as any,
        active: true,
      },
      ...prev,
    ]);
    setName("");
    setDescription("");
    setMemberIds([]);
    setTaskCodes([]);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → Zadania → Zespoły</div>
        <div className="text-xs text-muted-foreground">
          Zadanie przypisane do ekipy ma być widoczne wszystkim członkom. Źródłem przypisania pozostaje zespół, a nie 17 ręcznych kopii tego samego bloku. Cyfrowe gobliny tego nie lubią.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-2xl border bg-card p-4">
          <div className="text-sm font-semibold">Utwórz ekipę</div>
          <form className="mt-4 space-y-3" onSubmit={createTeam}>
            <label className="block space-y-1.5">
              <div className="text-sm font-medium">Nazwa</div>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="np. Ekipa monterska 2" />
            </label>

            <label className="block space-y-1.5">
              <div className="text-sm font-medium">Opis</div>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Do czego system może używać tej ekipy automatycznie…" />
            </label>

            <div className="space-y-2">
              <div className="text-sm font-medium">Pracownicy</div>
              {staff.map((member) => (
                <label key={member.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={memberIds.includes(member.id)} onChange={() => toggle(memberIds, setMemberIds, member.id)} />
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
                  <input type="checkbox" className="mt-0.5" checked={taskCodes.includes(category.code)} onChange={() => toggle(taskCodes, setTaskCodes, category.code)} />
                  <span>
                    <span className="font-medium">{category.name}</span>
                    <span className="block text-xs text-muted-foreground">{category.description}</span>
                  </span>
                </label>
              ))}
            </div>

            <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50" disabled={!name.trim() || memberIds.length === 0}>
              Utwórz ekipę (mock)
            </button>
          </form>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="text-sm font-semibold">Aktualne ekipy</div>
          <div className="mt-4 space-y-3">
            {teams.map((team) => (
              <div key={team.id} className="rounded-xl border p-4">
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
