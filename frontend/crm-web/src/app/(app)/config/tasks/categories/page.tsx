"use client";

import { useMemo, useState } from "react";

import { seedAutoTaskCategories, seedTaskTeams, seedWindowDefinitions } from "@/lib/mockTaskConfig";

export default function TaskAutoCategoriesConfigPage() {
  const teams = useMemo(() => seedTaskTeams(), []);
  const windows = useMemo(() => seedWindowDefinitions(), []);
  const [categories, setCategories] = useState(() => seedAutoTaskCategories());

  function toggleClientBookable(id: string) {
    setCategories((prev) => prev.map((item) => (item.id === id ? { ...item, clientBookable: !item.clientBookable } : item)));
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → Zadania → Kategorie automatyczne</div>
        <div className="text-xs text-muted-foreground">
          Tu system dowiaduje się, jakie typy zadań może sam generować i które z nich klient może rezerwować. Bez tego panel klienta zgadywałby rzeczy na chybił trafił, a to jest słaby sport.
        </div>
      </div>

      <div className="space-y-3">
        {categories.map((category) => (
          <div key={category.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{category.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{category.description}</div>
              </div>
              <button type="button" onClick={() => toggleClientBookable(category.id)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                Klient może rezerwować: {category.clientBookable ? "TAK" : "NIE"}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Kod systemowy</div>
                <div className="mt-1 text-sm font-medium">{category.code}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Okna czasowe</div>
                <div className="mt-1 text-sm font-medium">{windows.filter((item) => category.allowedWindowIds.includes(item.id)).map((item) => item.name).join(", ")}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Kwalifikowane ekipy</div>
                <div className="mt-1 text-sm font-medium">{teams.filter((team) => category.eligibleTeamIds.includes(team.id)).map((team) => team.name).join(", ")}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
