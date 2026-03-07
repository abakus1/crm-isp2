"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { seedSubscribers } from "@/lib/mockSubscribers";
import {
  getClientVisibleSlots,
  getTeamLabel,
  seedAutoTaskCategories,
  seedTaskTeams,
  seedWindowDefinitions,
  type AutoTaskCode,
} from "@/lib/mockTaskConfig";
import {
  getStaffLabel,
  seedTaskStaff,
  seedTasks,
  TASK_PERMISSION_PRESETS,
  type MockTask,
  type PermissionPreview,
  type TaskKind,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/mockTasks";

type AssignmentMode = "staff" | "team";

type TaskFormState = {
  kind: TaskKind;
  subscriberId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  assignedStaffIds: string[];
  assignedTeamIds: string[];
  assignmentMode: AssignmentMode;
  priority: TaskPriority;
  autoCategoryCode: AutoTaskCode | "manual";
};

const HOUR_HEIGHT = 64;
const DAY_HEIGHT = 24 * HOUR_HEIGHT;
const BASE_WEEK = new Date("2026-03-09T08:00:00");

function startOfWeek(date: Date) {
  const clone = new Date(date);
  const day = clone.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setHours(0, 0, 0, 0);
  clone.setDate(clone.getDate() + diff);
  return clone;
}

function addDays(date: Date, days: number) {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function parseMinutes(value: string) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function priorityBadge(priority: TaskPriority) {
  switch (priority) {
    case "urgent":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    case "high":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "normal":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    default:
      return "border-border bg-muted/40 text-foreground";
  }
}

function statusBadge(status: TaskStatus) {
  switch (status) {
    case "done":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "in_progress":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "cancelled":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";
    default:
      return "border-border bg-muted/40 text-foreground";
  }
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {desc && <div className="mt-1 text-xs text-muted-foreground">{desc}</div>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="text-sm font-medium">{label}</div>
      {children}
      {helper && <div className="text-xs text-muted-foreground">{helper}</div>}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={["w-full rounded-md border bg-background px-3 py-2 text-sm", props.className || ""].join(" ")} />;
}

function getInitialForm(subscriberId: string, selfStaffId: string): TaskFormState {
  return {
    kind: "internal",
    subscriberId,
    title: "",
    description: "",
    date: formatDateKey(startOfWeek(BASE_WEEK)),
    startTime: "09:00",
    endTime: "10:00",
    assignedStaffIds: [selfStaffId],
    assignedTeamIds: [],
    assignmentMode: "staff",
    priority: "normal",
    autoCategoryCode: "manual",
  };
}

export default function TasksPage() {
  const subscribers = useMemo(() => seedSubscribers(), []);
  const staff = useMemo(() => seedTaskStaff(), []);
  const teams = useMemo(() => seedTaskTeams(), []);
  const autoCategories = useMemo(() => seedAutoTaskCategories(), []);
  const windows = useMemo(() => seedWindowDefinitions(), []);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(BASE_WEEK));
  const [tasks, setTasks] = useState<MockTask[]>(() => seedTasks());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => seedTasks()[0]?.id ?? null);
  const [permissionModeKey, setPermissionModeKey] = useState<PermissionPreview["key"]>("manager");
  const [form, setForm] = useState<TaskFormState>(() => getInitialForm(seedSubscribers()[0]?.id ?? "", "staff_03"));
  const [draftCompletion, setDraftCompletion] = useState("");
  const [slotCategoryCode, setSlotCategoryCode] = useState<AutoTaskCode>("service_visit");

  const permissionMode = useMemo(
    () => TASK_PERMISSION_PRESETS.find((item) => item.key === permissionModeKey) ?? TASK_PERMISSION_PRESETS[0],
    [permissionModeKey]
  );

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);
  const selectedAutoCategory = useMemo(
    () => autoCategories.find((item) => item.code === slotCategoryCode) ?? autoCategories[0],
    [autoCategories, slotCategoryCode]
  );

  const visibleTasks = useMemo(() => {
    const from = weekStart.getTime();
    const to = addDays(weekStart, 7).getTime();
    return tasks.filter((task) => {
      const start = new Date(task.startAt).getTime();
      return start >= from && start < to;
    });
  }, [tasks, weekStart]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, MockTask[]>();
    for (const day of days) map.set(formatDateKey(day), []);
    for (const task of visibleTasks) {
      const key = task.startAt.slice(0, 10);
      if (!map.has(key)) continue;
      map.get(key)!.push(task);
    }
    for (const [, items] of map) {
      items.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return map;
  }, [days, visibleTasks]);

  const visibleSlots = useMemo(() => getClientVisibleSlots(formatDateKey(days[1] ?? days[0]), slotCategoryCode), [days, slotCategoryCode]);

  function syncAssignmentFromTeam(teamIds: string[]) {
    const assignedStaffIds = Array.from(new Set(teams.filter((team) => teamIds.includes(team.id)).flatMap((team) => team.memberStaffIds)));
    return assignedStaffIds;
  }

  function toggleAssignedStaff(staffId: string) {
    setForm((prev) => {
      const exists = prev.assignedStaffIds.includes(staffId);
      const nextIds = exists ? prev.assignedStaffIds.filter((id) => id !== staffId) : [...prev.assignedStaffIds, staffId];
      return { ...prev, assignedStaffIds: nextIds, assignedTeamIds: [], assignmentMode: "staff" };
    });
  }

  function toggleAssignedTeam(teamId: string) {
    setForm((prev) => {
      const exists = prev.assignedTeamIds.includes(teamId);
      const nextTeamIds = exists ? prev.assignedTeamIds.filter((id) => id !== teamId) : [...prev.assignedTeamIds, teamId];
      return {
        ...prev,
        assignedTeamIds: nextTeamIds,
        assignedStaffIds: syncAssignmentFromTeam(nextTeamIds),
        assignmentMode: "team",
      };
    });
  }

  function resetForm() {
    setForm(getInitialForm(subscribers[0]?.id ?? "", permissionMode.selfStaffId));
  }

  function handleCreateTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const assignedStaffIds = permissionMode.canAssignOthers ? form.assignedStaffIds : [permissionMode.selfStaffId];
    const assignedTeamIds = permissionMode.canAssignOthers ? form.assignedTeamIds : [];
    if (!form.title.trim() || !form.description.trim() || assignedStaffIds.length === 0) return;

    const subscriber = subscribers.find((item) => item.id === form.subscriberId) ?? null;
    const createdTask: MockTask = {
      id: `task_ui_${Date.now()}`,
      kind: form.kind,
      title: form.title.trim(),
      description: form.description.trim(),
      status: "planned",
      priority: form.priority,
      subscriberId: form.kind === "subscriber" ? subscriber?.id ?? null : null,
      subscriberName: form.kind === "subscriber" ? subscriber?.display_name ?? null : null,
      assignedStaffIds,
      assignedTeamIds,
      assignedTeamNames: assignedTeamIds.length > 0 ? teams.filter((team) => assignedTeamIds.includes(team.id)).map((team) => team.name) : [],
      startAt: `${form.date}T${form.startTime}:00`,
      endAt: `${form.date}T${form.endTime}:00`,
      createdBy: staff.find((item) => item.id === permissionMode.selfStaffId)?.name ?? "UI mock",
      completionNote: null,
      locationLabel:
        form.kind === "subscriber"
          ? subscriber?.addresses[0]
            ? `${subscriber.addresses[0].city}, ${subscriber.addresses[0].street} ${subscriber.addresses[0].building_no}${subscriber.addresses[0].apartment_no ? `/${subscriber.addresses[0].apartment_no}` : ""}`
            : undefined
          : undefined,
      source: "manual",
    };

    setTasks((prev) => [...prev, createdTask].sort((a, b) => a.startAt.localeCompare(b.startAt)));
    setSelectedTaskId(createdTask.id);
    setDraftCompletion("");
    resetForm();
  }

  function closeTask(taskId: string) {
    if (!draftCompletion.trim()) return;
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: "done",
              completionNote: draftCompletion.trim(),
            }
          : task
      )
    );
    setDraftCompletion("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-semibold">Zadania</div>
          <div className="text-xs text-muted-foreground">
            UI + mocki pod kanoniczny moduł operacyjny. Kalendarz tygodniowy jest silnikiem widoku, a konfiguracja ekip / slotów siedzi osobno w Konfiguracja → Zadania.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/config/tasks" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
            Konfiguracja zadań
          </Link>
          <Link href="/subscribers" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
            Abonenci
          </Link>
          <button type="button" onClick={() => setWeekStart((prev) => addDays(prev, -7))} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
            ← 7 dni
          </button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(BASE_WEEK))} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
            Dziś / tydzień bazowy
          </button>
          <button type="button" onClick={() => setWeekStart((prev) => addDays(prev, 7))} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
            7 dni →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card title="Scenariusz uprawnień" desc="UI-only symulacja: osobne prawa do przydzielania i edycji. Dzięki temu flow nie udaje, że każdy może wszystko, bo to zawsze kończy się biznesową sałatką.">
            <div className="grid grid-cols-1 gap-2">
              {TASK_PERMISSION_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    setPermissionModeKey(preset.key);
                    setForm((prev) => ({
                      ...prev,
                      assignedStaffIds: preset.canAssignOthers ? prev.assignedStaffIds : [preset.selfStaffId],
                      assignedTeamIds: preset.canAssignOthers ? prev.assignedTeamIds : [],
                    }));
                  }}
                  className={[
                    "rounded-xl border px-3 py-3 text-left transition",
                    permissionMode.key === preset.key ? "bg-muted/60" : "hover:bg-muted/40",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold">{preset.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    assign others: {preset.canAssignOthers ? "TAK" : "NIE"} · edit existing: {preset.canEditExisting ? "TAK" : "NIE"}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Dodaj zadanie" desc="Tworzymy flow na mockach. Finalny backend podłączymy dopiero, gdy UX przestanie trzeszczeć jak tania szafa.">
            <form className="space-y-3" onSubmit={handleCreateTask}>
              <Field label="Typ zadania">
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["internal", "Wewnętrzne ISP"],
                    ["subscriber", "Na abonencie"],
                  ] as Array<[TaskKind, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, kind: value }))}
                      className={[
                        "rounded-md border px-3 py-2 text-sm transition",
                        form.kind === value ? "bg-muted/60" : "hover:bg-muted/40",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              {form.kind === "subscriber" && (
                <Field label="Abonent">
                  <select
                    value={form.subscriberId}
                    onChange={(e) => setForm((prev) => ({ ...prev, subscriberId: e.target.value }))}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {subscribers.map((subscriber) => (
                      <option key={subscriber.id} value={subscriber.id}>
                        {subscriber.display_name} ({subscriber.id})
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Kategoria automatyczna / źródło">
                <select
                  value={form.autoCategoryCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, autoCategoryCode: e.target.value as TaskFormState["autoCategoryCode"] }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="manual">Manualne / ręczne</option>
                  {autoCategories.map((category) => (
                    <option key={category.id} value={category.code}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Tytuł">
                <TextInput value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="np. Wizyta serwisowa / instalacja / zadanie wewnętrzne" />
              </Field>

              <Field label="Opis">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={5}
                  placeholder="Co trzeba zrobić, jaki kontekst, czego pilnować…"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Data">
                  <TextInput type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} />
                </Field>
                <Field label="Od">
                  <TextInput type="time" value={form.startTime} onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))} />
                </Field>
                <Field label="Do">
                  <TextInput type="time" value={form.endTime} onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))} />
                </Field>
              </div>

              <Field label="Priorytet">
                <select
                  value={form.priority}
                  onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="low">Niski</option>
                  <option value="normal">Normalny</option>
                  <option value="high">Wysoki</option>
                  <option value="urgent">Pilny</option>
                </select>
              </Field>

              <Field label="Tryb przypisania" helper="Zespół oznacza ekipę logiczną. W kalendarzu zadanie i tak wpada wszystkim członkom ekipy, ale źródłem przypisania zostaje team — czyli mniej bagna, więcej sensu.">
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["staff", "Pojedyncze osoby"],
                    ["team", "Zespół / ekipa"],
                  ] as Array<[AssignmentMode, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, assignmentMode: value }))}
                      className={[
                        "rounded-md border px-3 py-2 text-sm transition",
                        form.assignmentMode === value ? "bg-muted/60" : "hover:bg-muted/40",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              {form.assignmentMode === "team" ? (
                <Field label="Przypisane zespoły" helper={permissionMode.canAssignOthers ? "Możesz zaznaczyć jedną lub więcej ekip. Mock zaciąga wszystkich członków do bloku zadania." : "Tryb self-only nie pozwala przypinać ekip — pracownik nie staje się nagle kapitanem całego statku."}>
                  <div className="space-y-2">
                    {teams.map((team) => {
                      const checked = permissionMode.canAssignOthers ? form.assignedTeamIds.includes(team.id) : false;
                      return (
                        <label key={team.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                          <input type="checkbox" className="mt-0.5" checked={checked} disabled={!permissionMode.canAssignOthers} onChange={() => toggleAssignedTeam(team.id)} />
                          <span>
                            <span className="font-medium">{team.name}</span>
                            <span className="block text-xs text-muted-foreground">{team.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Field>
              ) : (
                <Field
                  label="Przypisani pracownicy"
                  helper={
                    permissionMode.canAssignOthers
                      ? "W tej symulacji kierownik może przypisać pojedynczą osobę albo zespół."
                      : "Tryb self-only: zwykły pracownik dodaje zadanie tylko sobie. Checkboxy są poglądowe, żeby flow nie kłamał o przyszłym RBAC."
                  }
                >
                  <div className="space-y-2">
                    {staff.map((member) => {
                      const checked = permissionMode.canAssignOthers ? form.assignedStaffIds.includes(member.id) : member.id === permissionMode.selfStaffId;
                      return (
                        <label key={member.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                          <input type="checkbox" className="mt-0.5" checked={checked} disabled={!permissionMode.canAssignOthers} onChange={() => toggleAssignedStaff(member.id)} />
                          <span>
                            <span className="font-medium">{member.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {member.team} · {member.role}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Field>
              )}

              <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
                Finalne przypisanie: {form.assignedTeamIds.length > 0 ? `zespół ${getTeamLabel(form.assignedTeamIds)}` : getStaffLabel(form.assignedStaffIds) || "—"}
              </div>

              <button type="submit" disabled={!form.title.trim() || !form.description.trim()} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50">
                Dodaj zadanie (mock)
              </button>
            </form>
          </Card>

          <Card title="Szybki podgląd konfiguracji" desc="Tu tylko teaser. Pełne edytowalne okna siedzą w Konfiguracja → Zadania, żeby operacja i konfiguracja nie gryzły się jak dwa routery na tym samym adresie IP.">
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border p-3">Ekipy aktywne: {teams.length}</div>
              <div className="rounded-lg border p-3">Kategorie automatyczne: {autoCategories.length}</div>
              <div className="rounded-lg border p-3">Definicje okien: {windows.length}</div>
            </div>
          </Card>
        </div>

        <Card title="Kalendarz tygodniowy 7 dni / 24h" desc={`Widok od ${formatDateKey(days[0])} do ${formatDateKey(days[6])}. Skok tygodnia: dokładnie tak, jak ustaliliśmy.`}>
          <div className="overflow-x-auto">
            <div className="min-w-[1040px]">
              <div className="grid grid-cols-[72px_repeat(7,minmax(120px,1fr))] gap-0 border-b bg-muted/20">
                <div className="border-r p-2 text-xs text-muted-foreground">Godzina</div>
                {days.map((day) => (
                  <div key={formatDateKey(day)} className="border-r p-2 text-center text-xs font-medium last:border-r-0">
                    {formatDayLabel(day)}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[72px_repeat(7,minmax(120px,1fr))]">
                <div className="relative border-r" style={{ height: `${DAY_HEIGHT}px` }}>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={hour} className="absolute inset-x-0 border-b px-2 text-[11px] text-muted-foreground" style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}>
                      {`${`${hour}`.padStart(2, "0")}:00`}
                    </div>
                  ))}
                </div>

                {days.map((day) => {
                  const key = formatDateKey(day);
                  const items = tasksByDay.get(key) ?? [];
                  return (
                    <div key={key} className="relative border-r last:border-r-0" style={{ height: `${DAY_HEIGHT}px` }}>
                      {Array.from({ length: 24 }, (_, hour) => (
                        <div key={`${key}-${hour}`} className="absolute inset-x-0 border-b" style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }} />
                      ))}

                      {items.map((task) => {
                        const top = (parseMinutes(task.startAt) / 60) * HOUR_HEIGHT;
                        const rawHeight = ((parseMinutes(task.endAt) - parseMinutes(task.startAt)) / 60) * HOUR_HEIGHT;
                        const height = Math.max(rawHeight, 44);
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => {
                              setSelectedTaskId(task.id);
                              setDraftCompletion(task.completionNote ?? "");
                            }}
                            className={[
                              "absolute left-1 right-1 rounded-xl border p-2 text-left shadow-sm transition hover:bg-muted/10",
                              selectedTaskId === task.id ? "ring-2 ring-muted-foreground/20" : "",
                            ].join(" ")}
                            style={{ top: `${top}px`, height: `${height}px` }}
                          >
                            <div className="text-xs font-semibold leading-tight">{task.title}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {formatTime(task.startAt)}–{formatTime(task.endAt)}
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                              {task.kind === "subscriber" ? task.subscriberName : "Wewnętrzne ISP"}
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{task.assignedTeamNames.join(", ") || getStaffLabel(task.assignedStaffIds)}</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Szczegóły zadania" desc="Kliknięcie bloku pokazuje kartę zadania. Tu później spokojnie podepniemy serwis, reklamacje i umowy bez budowania drugiego potwora.">
            {!selectedTask ? (
              <div className="text-sm text-muted-foreground">Wybierz zadanie z kalendarza.</div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold">{selectedTask.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selectedTask.kind === "subscriber" ? `Abonent: ${selectedTask.subscriberName}` : "Wewnętrzne Gemini / ISP"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={["inline-flex rounded-md border px-2 py-1 text-xs font-medium", priorityBadge(selectedTask.priority)].join(" ")}>{selectedTask.priority}</span>
                    <span className={["inline-flex rounded-md border px-2 py-1 text-xs font-medium", statusBadge(selectedTask.status)].join(" ")}>{selectedTask.status}</span>
                  </div>
                </div>

                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">Zakres czasu</div>
                  <div className="mt-1 font-medium">
                    {formatDateTime(selectedTask.startAt)} → {formatDateTime(selectedTask.endAt)}
                  </div>
                </div>

                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">Opis zadania</div>
                  <div className="mt-1 whitespace-pre-wrap">{selectedTask.description}</div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Przypisani</div>
                    <div className="mt-1 font-medium">{getStaffLabel(selectedTask.assignedStaffIds)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Zespoły: {selectedTask.assignedTeamNames.join(", ") || "—"}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Źródło / lokalizacja</div>
                    <div className="mt-1 font-medium">{selectedTask.source}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selectedTask.locationLabel || "Brak lokalizacji (wewnętrzne)."}</div>
                  </div>
                </div>

                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">Uprawnienia w tym widoku</div>
                  <div className="mt-1 text-sm">assign/change: {permissionMode.canAssignOthers ? "TAK" : "NIE"} · edit existing: {permissionMode.canEditExisting ? "TAK" : "NIE"}</div>
                </div>

                {selectedTask.status !== "done" ? (
                  <div className="rounded-xl border p-3">
                    <div className="text-sm font-medium">Zamknij zadanie</div>
                    <div className="mt-1 text-xs text-muted-foreground">Zamknięcie wymaga opisu wykonania. Bez tego historia byłaby tylko cyfrowym shruggem.</div>
                    <textarea value={draftCompletion} onChange={(e) => setDraftCompletion(e.target.value)} rows={4} placeholder="Co zrobiono, jaki wynik, co zostawić dla kolejnych osób…" className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm" />
                    <button
                      type="button"
                      onClick={() => closeTask(selectedTask.id)}
                      disabled={!(permissionMode.canCloseAny || selectedTask.assignedStaffIds.includes(permissionMode.selfStaffId)) || !draftCompletion.trim()}
                      className="mt-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Zakończ zadanie
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                    <div className="font-medium text-emerald-800 dark:text-emerald-200">Opis wykonania</div>
                    <div className="mt-2 whitespace-pre-wrap text-emerald-900/90 dark:text-emerald-100">{selectedTask.completionNote}</div>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="Wolne sloty widoczne dla klienta" desc="Klient nie ogląda kalendarza pracowników, tylko sloty policzone z okien, ekip i zajętości. To tutaj rodzi się mniej chaosu i mniej telefonu 'a dlaczego mi pokazali termin duch' .">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={slotCategoryCode} onChange={(e) => setSlotCategoryCode(e.target.value as AutoTaskCode)} className="rounded-md border bg-background px-3 py-2 text-sm">
                {autoCategories.filter((item) => item.clientBookable).map((category) => (
                  <option key={category.id} value={category.code}>
                    {category.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">Źródłowe okna: {selectedAutoCategory.allowedWindowIds.join(", ")}</span>
            </div>

            <div className="space-y-2 text-sm">
              {visibleSlots.length === 0 ? (
                <div className="rounded-lg border border-dashed p-3 text-muted-foreground">Brak wolnych slotów dla tego dnia / kategorii. Mock już grzecznie pokazuje, kiedy układanka jest pełna.</div>
              ) : (
                visibleSlots.slice(0, 6).map((slot) => (
                  <div key={slot.slotId} className="rounded-lg border p-3">
                    <div className="font-medium">
                      {formatDateTime(slot.startsAt)} → {formatTime(slot.endsAt)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      pozostała pojemność: {slot.remainingCapacity} · ekipy: {slot.eligibleTeamNames.join(", ")}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
