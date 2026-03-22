"use client";

import { useMemo, useState } from "react";

import { seedAutoTaskCategories, seedTaskTeams, seedWindowDefinitions, type AutoTaskCode } from "@/lib/mockTaskConfig";

const CODE_OPTIONS: Array<{ value: AutoTaskCode; label: string }> = [
  { value: "connection", label: "Podłączenie" },
  { value: "failure", label: "Awaria" },
  { value: "service_visit", label: "Wizyta serwisowa" },
  { value: "dismantle", label: "Demontaż" },
];

export default function TaskAutoCategoriesConfigPage() {
  const [teams, setTeams] = useState(() => seedTaskTeams());
  const windows = useMemo(() => seedWindowDefinitions(), []);
  const [categories, setCategories] = useState(() => seedAutoTaskCategories());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [code, setCode] = useState<AutoTaskCode>("connection");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clientBookable, setClientBookable] = useState(true);
  const [active, setActive] = useState(true);
  const [allowedWindowIds, setAllowedWindowIds] = useState<string[]>([]);
  const [eligibleTeamIds, setEligibleTeamIds] = useState<string[]>([]);

  const visibleCategories = showInactive ? categories : categories.filter((category) => category.active);
  const activeTeams = teams.filter((team) => team.active);
  const activeWindows = windows.filter((window) => window.active);

  function resetForm() {
    setEditingId(null);
    setCode("connection");
    setName("");
    setDescription("");
    setClientBookable(true);
    setActive(true);
    setAllowedWindowIds([]);
    setEligibleTeamIds([]);
  }

  function toggle(items: string[], setItems: (next: string[]) => void, value: string) {
    setItems(items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);
  }

  function submitCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingId) {
      setCategories((prev) =>
        prev.map((category) =>
          category.id === editingId
            ? {
                ...category,
                code,
                name: name.trim(),
                description: description.trim() || "Kategoria bez dodatkowego opisu.",
                clientBookable,
                active,
                allowedWindowIds,
                eligibleTeamIds,
              }
            : category,
        ),
      );
      resetForm();
      return;
    }

    setCategories((prev) => [
      {
        id: `auto_task_category_${Date.now()}`,
        code,
        name: name.trim(),
        description: description.trim() || "Nowa kategoria automatyczna z mockowego formularza.",
        clientBookable,
        active,
        allowedWindowIds,
        eligibleTeamIds,
      },
      ...prev,
    ]);
    resetForm();
  }

  function startEdit(categoryId: string) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    setEditingId(category.id);
    setCode(category.code);
    setName(category.name);
    setDescription(category.description);
    setClientBookable(category.clientBookable);
    setActive(category.active);
    setAllowedWindowIds(category.allowedWindowIds);
    setEligibleTeamIds(category.eligibleTeamIds.filter((teamId) => activeTeams.some((team) => team.id === teamId)));
  }

  function toggleCategoryActive(categoryId: string) {
    setCategories((prev) => prev.map((category) => (category.id === categoryId ? { ...category, active: !category.active } : category)));
    if (editingId === categoryId) {
      setActive((prev) => !prev);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → Zadania → Kategorie automatyczne</div>
        <div className="text-xs text-muted-foreground">
          Dobry kierunek: bez usuwania. Kategoria zostaje w systemie dla historii, raportów i przyszłych FK, ale po deaktywacji nie da się jej już użyć w nowych flow.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[430px_minmax(0,1fr)]">
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">{editingId ? "Edytuj kategorię" : "Dodaj kategorię"}</div>
            {editingId ? (
              <button type="button" onClick={resetForm} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                Anuluj edycję
              </button>
            ) : null}
          </div>

          <form className="mt-4 space-y-3" onSubmit={submitCategory}>
            <label className="block space-y-1.5">
              <div className="text-sm font-medium">Kod systemowy</div>
              <select value={code} onChange={(e) => setCode(e.target.value as AutoTaskCode)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                {CODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <div className="text-sm font-medium">Nazwa</div>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="np. Wizyta techniczna premium" />
            </label>

            <label className="block space-y-1.5">
              <div className="text-sm font-medium">Opis</div>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Do czego służy ta kategoria i kiedy system ma jej używać…" />
            </label>

            <label className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <input type="checkbox" checked={clientBookable} onChange={(e) => setClientBookable(e.target.checked)} />
              <span>Klient może rezerwować tę kategorię</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>Kategoria aktywna i dostępna dla nowych zadań</span>
            </label>

            <div className="space-y-2">
              <div className="text-sm font-medium">Aktywne okna czasowe</div>
              {activeWindows.map((window) => (
                <label key={window.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={allowedWindowIds.includes(window.id)} onChange={() => toggle(allowedWindowIds, setAllowedWindowIds, window.id)} />
                  <span>
                    <span className="font-medium">{window.name}</span>
                    <span className="block text-xs text-muted-foreground">{window.startHour}:00–{window.endHour}:00 · slot {window.slotDurationMinutes} min</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Aktywne kwalifikowane ekipy</div>
              {activeTeams.map((team) => (
                <label key={team.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={eligibleTeamIds.includes(team.id)} onChange={() => toggle(eligibleTeamIds, setEligibleTeamIds, team.id)} />
                  <span>
                    <span className="font-medium">{team.name}</span>
                    <span className="block text-xs text-muted-foreground">{team.description}</span>
                  </span>
                </label>
              ))}
              {!activeTeams.length ? <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">Brak aktywnych ekip — najpierw trzeba je aktywować w konfiguracji zespołów.</div> : null}
            </div>

            <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50" disabled={!name.trim()}>
              {editingId ? "Zapisz zmiany" : "Dodaj kategorię"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">Kategorie w systemie</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              <span>Pokaż zdeaktywowane</span>
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {visibleCategories.map((category) => (
              <div key={category.id} className={`rounded-2xl border bg-card p-4 ${editingId === category.id ? "border-primary ring-1 ring-primary/30" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{category.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{category.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border px-2 py-1 text-xs">{category.active ? "aktywna" : "nieaktywna"}</span>
                    <span className="rounded-md border px-2 py-1 text-xs">{category.clientBookable ? "panel klienta: TAK" : "panel klienta: NIE"}</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Kod systemowy</div>
                    <div className="mt-1 text-sm font-medium">{category.code}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Okna czasowe</div>
                    <div className="mt-1 text-sm font-medium">{windows.filter((item) => category.allowedWindowIds.includes(item.id)).map((item) => item.name).join(", ") || "brak"}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Kwalifikowane ekipy</div>
                    <div className="mt-1 text-sm font-medium">{teams.filter((team) => category.eligibleTeamIds.includes(team.id)).map((team) => team.name).join(", ") || "brak"}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(category.id)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                    Edytuj
                  </button>
                  <button type="button" onClick={() => toggleCategoryActive(category.id)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                    {category.active ? "Dezaktywuj" : "Aktywuj"}
                  </button>
                </div>
              </div>
            ))}
            {!visibleCategories.length ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Brak kategorii do wyświetlenia dla obecnego filtra.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
