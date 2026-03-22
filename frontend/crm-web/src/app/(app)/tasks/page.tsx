"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
type TaskContextMode = "general" | "subscriber_prefill";
type LeftPanelMode = "idle" | "create" | "edit";

type CalendarViewTarget =
  | { type: "staff"; id: string }
  | { type: "team"; id: string };

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

type DragTaskState = {
  taskId: string;
  durationMinutes: number;
};

type ResizeTaskState = {
  taskId: string;
  dayKey: string;
  startMinutes: number;
  initialDurationMinutes: number;
  startClientY: number;
};

const HOUR_HEIGHT = 64;
const DAY_HEIGHT = 24 * HOUR_HEIGHT;
const SLOT_MINUTES = 60;
const DEFAULT_TASK_MINUTES = 60;
const BASE_WEEK = new Date("2026-03-09T08:00:00");
const VIEW_NOW = new Date("2026-03-12T16:30:00");

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundToStep(minutes: number, step = SLOT_MINUTES) {
  return Math.round(minutes / step) * step;
}

function minutesToTime(minutes: number) {
  const safe = clamp(minutes, 0, 24 * 60);
  const normalizedHours = Math.floor(safe / 60);
  const normalizedMinutes = safe % 60;
  const hours = `${Math.min(normalizedHours, 23)}`.padStart(2, "0");
  const mins = `${normalizedHours >= 24 ? 59 : normalizedMinutes}`.padStart(2, "0");
  return `${hours}:${mins}`;
}

function buildIso(date: string, time: string) {
  return `${date}T${time}:00`;
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

function priorityLabel(priority: TaskPriority) {
  switch (priority) {
    case "urgent":
      return "Pilny";
    case "high":
      return "Wysoki";
    case "normal":
      return "Normalny";
    default:
      return "Niski";
  }
}

function statusLabel(status: TaskStatus) {
  switch (status) {
    case "planned":
      return "Zaplanowane";
    case "in_progress":
      return "W trakcie";
    case "done":
      return "Zakończone";
    default:
      return "Anulowane";
  }
}

function isTaskOverdue(task: MockTask) {
  return task.status !== "done" && task.status !== "cancelled" && new Date(task.endAt).getTime() < VIEW_NOW.getTime();
}

function taskSurfaceClass(task: MockTask, selected: boolean) {
  if (task.status === "done") {
    return [
      "border-emerald-300/70 bg-emerald-100/85 text-emerald-950 dark:border-emerald-700/60 dark:bg-emerald-900/35 dark:text-emerald-100",
      selected ? "ring-2 ring-emerald-500/30" : "",
    ].join(" ");
  }

  if (task.status === "cancelled") {
    return [
      "border-zinc-300/70 bg-zinc-100/85 text-zinc-900 dark:border-zinc-700/60 dark:bg-zinc-800/60 dark:text-zinc-100",
      selected ? "ring-2 ring-zinc-500/20" : "",
    ].join(" ");
  }

  if (isTaskOverdue(task)) {
    return [
      "border-red-700/50 bg-red-300/90 text-red-950 dark:border-red-500/60 dark:bg-red-900/70 dark:text-red-50",
      selected ? "ring-2 ring-red-600/30" : "",
    ].join(" ");
  }

  return [
    "border-red-300/70 bg-red-100/80 text-red-950 dark:border-red-800/60 dark:bg-red-950/55 dark:text-red-50",
    selected ? "ring-2 ring-red-500/20" : "",
  ].join(" ");
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


function normalizeTaskToHour(task: MockTask): MockTask {
  const startDate = new Date(task.startAt);
  startDate.setMinutes(0, 0, 0);

  const endDate = new Date(task.endAt);
  endDate.setMinutes(0, 0, 0);
  if (endDate.getTime() <= startDate.getTime()) {
    endDate.setHours(startDate.getHours() + 1);
  }

  return {
    ...task,
    startAt: startDate.toISOString().slice(0, 19),
    endAt: endDate.toISOString().slice(0, 19),
  };
}

function isTaskVisibleForTarget(task: MockTask, target: CalendarViewTarget) {
  if (target.type === "team") {
    return task.assignedTeamIds?.includes(target.id) ?? false;
  }
  return task.assignedStaffIds.includes(target.id);
}

function getViewTargetLabel(target: CalendarViewTarget, staffList: ReturnType<typeof seedTaskStaff>, teamList: ReturnType<typeof seedTaskTeams>) {
  if (target.type === "team") {
    return teamList.find((team) => team.id === target.id)?.name ?? target.id;
  }
  return staffList.find((member) => member.id === target.id)?.name ?? target.id;
}


function getDefaultAssignmentsForTarget(target: CalendarViewTarget, teamList: ReturnType<typeof seedTaskTeams>) {
  if (target.type === "team") {
    const team = teamList.find((item) => item.id === target.id);
    return {
      assignmentMode: "team" as AssignmentMode,
      assignedTeamIds: team ? [team.id] : [],
      assignedStaffIds: team ? [...team.memberStaffIds] : [],
    };
  }

  return {
    assignmentMode: "staff" as AssignmentMode,
    assignedTeamIds: [],
    assignedStaffIds: [target.id],
  };
}

function getInitialForm(subscriberId: string, selfStaffId: string, mode: TaskContextMode = "general"): TaskFormState {
  return {
    kind: mode === "subscriber_prefill" ? "subscriber" : "internal",
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
  const [tasks, setTasks] = useState<MockTask[]>(() => seedTasks().map(normalizeTaskToHour));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => seedTasks()[0]?.id ?? null);
  const [permissionModeKey, setPermissionModeKey] = useState<PermissionPreview["key"]>("manager");
  const [taskContextMode, setTaskContextMode] = useState<TaskContextMode>("general");
  const [leftPanelMode, setLeftPanelMode] = useState<LeftPanelMode>("idle");
  const [form, setForm] = useState<TaskFormState>(() => getInitialForm(seedSubscribers()[0]?.id ?? "", "staff_03"));
  const [draftCompletion, setDraftCompletion] = useState("");
  const [slotCategoryCode, setSlotCategoryCode] = useState<AutoTaskCode>("service_visit");
  const [dragTaskState, setDragTaskState] = useState<DragTaskState | null>(null);
  const [resizeTaskState, setResizeTaskState] = useState<ResizeTaskState | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [detailPulse, setDetailPulse] = useState(false);
  const [calendarViewTarget, setCalendarViewTarget] = useState<CalendarViewTarget>({ type: "staff", id: "staff_03" });
  const [routePrefill, setRoutePrefill] = useState<{ subscriberId: string; source: string }>({
    subscriberId: "",
    source: "",
  });
  const detailCardRef = useRef<HTMLDivElement | null>(null);

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
  const selectedSubscriber = useMemo(() => subscribers.find((item) => item.id === form.subscriberId) ?? null, [subscribers, form.subscriberId]);
  const selectedViewTargetLabel = useMemo(() => getViewTargetLabel(calendarViewTarget, staff, teams), [calendarViewTarget, staff, teams]);

  useEffect(() => {
    setCalendarViewTarget((prev) => {
      if (permissionMode.canAssignOthers) {
        return prev;
      }
      return { type: "staff", id: permissionMode.selfStaffId };
    });
  }, [permissionMode.canAssignOthers, permissionMode.selfStaffId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRoutePrefill({
      subscriberId: params.get("subscriberId") || "",
      source: params.get("source") || "",
    });
  }, []);

  useEffect(() => {
    const subscriberId = routePrefill.subscriberId;
    const source = routePrefill.source;
    const subscriberExists = subscribers.some((item) => item.id === subscriberId);

    if (source === "subscriber-card" && subscriberExists) {
      setTaskContextMode("subscriber_prefill");
      setLeftPanelMode("create");
      setForm((prev) => ({
        ...prev,
        kind: "subscriber",
        subscriberId,
        assignedStaffIds: prev.assignedStaffIds.length > 0 ? prev.assignedStaffIds : [permissionMode.selfStaffId],
      }));
      return;
    }

    setTaskContextMode("general");
  }, [routePrefill, subscribers, permissionMode.selfStaffId]);

  useEffect(() => {
    if (!resizeTaskState) return;

    const activeResize = resizeTaskState;

    function handleMouseMove(event: MouseEvent) {
      const deltaPixels = event.clientY - activeResize.startClientY;
      const deltaMinutes = roundToStep((deltaPixels / HOUR_HEIGHT) * 60);
      const nextDurationMinutes = clamp(activeResize.initialDurationMinutes + deltaMinutes, SLOT_MINUTES, 24 * 60 - activeResize.startMinutes);
      const nextEndMinutes = activeResize.startMinutes + nextDurationMinutes;

      setTasks((prev) =>
        prev.map((task) =>
          task.id === activeResize.taskId
            ? normalizeTaskToHour({
                ...task,
                endAt: buildIso(activeResize.dayKey, minutesToTime(nextEndMinutes)),
              })
            : task
        )
      );
    }

    function handleMouseUp() {
      const task = tasks.find((item) => item.id === activeResize.taskId);
      if (task) {
        const accepted = window.confirm(
          `Potwierdzić zmianę czasu zadania?\\nNowy zakres: ${formatDateTime(task.startAt)} → ${formatDateTime(task.endAt)}`
        );

        if (!accepted) {
          const originalDuration = activeResize.initialDurationMinutes;
          setTasks((prev) =>
            prev.map((item) =>
              item.id === activeResize.taskId
                ? {
                    ...item,
                    endAt: buildIso(activeResize.dayKey, minutesToTime(activeResize.startMinutes + originalDuration)),
                  }
                : item
            )
          );
        }
      }

      setResizeTaskState(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizeTaskState, tasks]);

  useEffect(() => {
    if (!detailPulse) return;
    const timeout = window.setTimeout(() => setDetailPulse(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [detailPulse]);

  const visibleTasks = useMemo(() => {
    const from = weekStart.getTime();
    const to = addDays(weekStart, 7).getTime();
    return tasks.filter((task) => {
      const start = new Date(task.startAt).getTime();
      return start >= from && start < to && isTaskVisibleForTarget(task, calendarViewTarget);
    });
  }, [tasks, weekStart, calendarViewTarget]);

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

  function openCreatePanel(date: string, startMinutes: number, durationMinutes = DEFAULT_TASK_MINUTES) {
    const normalizedDuration = Math.max(roundToStep(durationMinutes), DEFAULT_TASK_MINUTES);
    const safeStart = clamp(roundToStep(startMinutes), 0, 24 * 60 - SLOT_MINUTES);
    const safeEnd = clamp(safeStart + normalizedDuration, SLOT_MINUTES, 24 * 60);
    const targetAssignments = permissionMode.canAssignOthers
      ? getDefaultAssignmentsForTarget(calendarViewTarget, teams)
      : { assignmentMode: "staff" as AssignmentMode, assignedTeamIds: [], assignedStaffIds: [permissionMode.selfStaffId] };

    setEditingTaskId(null);
    setLeftPanelMode("create");
    setForm((prev) => ({
      ...prev,
      ...targetAssignments,
      date,
      startTime: minutesToTime(safeStart),
      endTime: minutesToTime(safeEnd),
      kind: taskContextMode === "subscriber_prefill" ? "subscriber" : prev.kind,
    }));
  }

  function openEditPanel(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !permissionMode.canEditExisting) return;

    setEditingTaskId(task.id);
    setLeftPanelMode("edit");
    setSelectedTaskId(task.id);
    setDraftCompletion(task.completionNote ?? "");
    setForm({
      kind: task.kind,
      subscriberId: task.subscriberId ?? subscribers[0]?.id ?? "",
      title: task.title,
      description: task.description,
      date: task.startAt.slice(0, 10),
      startTime: minutesToTime(parseMinutes(task.startAt)),
      endTime: minutesToTime(parseMinutes(task.endAt)),
      assignedStaffIds: [...task.assignedStaffIds],
      assignedTeamIds: [...(task.assignedTeamIds ?? [])],
      assignmentMode: (task.assignedTeamIds?.length ?? 0) > 0 ? "team" : "staff",
      priority: task.priority,
      autoCategoryCode: task.source === "manual" ? "manual" : "service_visit",
    });
  }

  function resetForm() {
    const subscriberId = taskContextMode === "subscriber_prefill" ? form.subscriberId || subscribers[0]?.id || "" : subscribers[0]?.id || "";
    setEditingTaskId(null);
    setForm(getInitialForm(subscriberId, permissionMode.selfStaffId, taskContextMode));
    setLeftPanelMode(taskContextMode === "subscriber_prefill" ? "create" : "idle");
  }

  function handleTaskSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const assignedStaffIds = permissionMode.canAssignOthers ? form.assignedStaffIds : [permissionMode.selfStaffId];
    const assignedTeamIds = permissionMode.canAssignOthers ? form.assignedTeamIds : [];
    const startMinutes = roundToStep(parseMinutes(buildIso(form.date, form.startTime)));
    const endMinutes = roundToStep(parseMinutes(buildIso(form.date, form.endTime)));
    const normalizedEndMinutes = Math.max(endMinutes, startMinutes + DEFAULT_TASK_MINUTES);

    if (!form.title.trim() || !form.description.trim() || assignedStaffIds.length === 0) return;

    const subscriber = subscribers.find((item) => item.id === form.subscriberId) ?? null;
    const payload = normalizeTaskToHour({
      id: editingTaskId ?? `task_ui_${Date.now()}`,
      kind: form.kind,
      title: form.title.trim(),
      description: form.description.trim(),
      status: editingTaskId ? tasks.find((item) => item.id === editingTaskId)?.status ?? "planned" : "planned",
      priority: form.priority,
      subscriberId: form.kind === "subscriber" ? subscriber?.id ?? null : null,
      subscriberName: form.kind === "subscriber" ? subscriber?.display_name ?? null : null,
      assignedStaffIds,
      assignedTeamIds,
      assignedTeamNames: assignedTeamIds.length > 0 ? teams.filter((team) => assignedTeamIds.includes(team.id)).map((team) => team.name) : [],
      startAt: buildIso(form.date, minutesToTime(startMinutes)),
      endAt: buildIso(form.date, minutesToTime(normalizedEndMinutes)),
      createdBy: staff.find((item) => item.id === permissionMode.selfStaffId)?.name ?? "UI mock",
      completionNote: editingTaskId ? tasks.find((item) => item.id === editingTaskId)?.completionNote ?? null : null,
      locationLabel:
        form.kind === "subscriber"
          ? subscriber?.addresses[0]
            ? `${subscriber.addresses[0].city}, ${subscriber.addresses[0].street} ${subscriber.addresses[0].building_no}${subscriber.addresses[0].apartment_no ? `/${subscriber.addresses[0].apartment_no}` : ""}`
            : undefined
          : undefined,
      source: "manual",
    });

    setTasks((prev) => {
      const next = editingTaskId ? prev.map((task) => (task.id === editingTaskId ? payload : task)) : [...prev, payload];
      return next.sort((a, b) => a.startAt.localeCompare(b.startAt));
    });
    setSelectedTaskId(payload.id);
    setDraftCompletion(payload.completionNote ?? "");
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

  function handleCalendarCellClick(dayKey: string, event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-task-card='true']")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = clamp(event.clientY - rect.top, 0, DAY_HEIGHT - 1);
    const minutes = roundToStep((offsetY / HOUR_HEIGHT) * 60);
    openCreatePanel(dayKey, minutes);
  }

  function handleTaskDrop(dayKey: string, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!permissionMode.canEditExisting || !dragTaskState) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = clamp(event.clientY - rect.top, 0, DAY_HEIGHT - 1);
    const normalizedDuration = Math.max(roundToStep(dragTaskState.durationMinutes), DEFAULT_TASK_MINUTES);
    const nextStartMinutes = clamp(roundToStep((offsetY / HOUR_HEIGHT) * 60), 0, 24 * 60 - normalizedDuration);
    const movedTask = tasks.find((task) => task.id === dragTaskState.taskId);
    if (!movedTask) {
      setDragTaskState(null);
      return;
    }

    const nextStartAt = buildIso(dayKey, minutesToTime(nextStartMinutes));
    const nextEndAt = buildIso(dayKey, minutesToTime(nextStartMinutes + dragTaskState.durationMinutes));

    const accepted = window.confirm(`Potwierdzić przesunięcie zadania?\\n${formatDateTime(nextStartAt)} → ${formatDateTime(nextEndAt)}`);
    if (accepted) {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === dragTaskState.taskId
            ? {
                ...task,
                startAt: nextStartAt,
                endAt: nextEndAt,
              }
            : task
        )
      );
      setSelectedTaskId(dragTaskState.taskId);
    }

    setDragTaskState(null);
  }

  function openTaskDetails(taskId: string) {
    setSelectedTaskId(taskId);
    setLeftPanelMode("idle");
    setDetailPulse(true);
    detailCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-semibold">Zadania</div>
          <div className="text-xs text-muted-foreground">
            UI + mocki pod kanoniczny moduł operacyjny. Klik w slot kalendarza otwiera formularz po lewej z gotowym dniem i godzinami, a dwuklik w blok wbija w szczegóły.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/config/tasks" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
            Konfiguracja zadań
          </Link>
          <Link href="/subscribers" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
            Abonenci
          </Link>
          <button type="button" onClick={() => openCreatePanel(formatDateKey(days[0]), 9 * 60)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
            + Nowe zadanie
          </button>
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

          {leftPanelMode === "idle" ? (
            <Card title="Dodawanie z kalendarza" desc="Kliknij w dowolne pole dnia/godziny, a lewy panel otworzy formularz z uzupełnioną datą i czasem. Trochę mniej klikania w próżnię, trochę więcej sensu.">
              <div className="space-y-3 text-sm">
                <div className="rounded-xl border border-dashed p-4 text-muted-foreground">
                  Formularz zadania jest teraz wywoływany z kalendarza. Wybierasz slot → panel po lewej już wie, który dzień i jakie godziny mają wskoczyć.
                </div>
                <button type="button" onClick={() => openCreatePanel(formatDateKey(days[0]), 9 * 60)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                  Otwórz ręcznie formularz
                </button>
              </div>
            </Card>
          ) : (
            <Card title={leftPanelMode === "edit" ? "Edytuj zadanie" : "Dodaj zadanie"} desc={leftPanelMode === "edit" ? "Kliknięcie zadania przez osobę z uprawnieniami otwiera edycję po lewej. Ten sam formularz ogarnia tworzenie i poprawki bez żonglowania oknami." : "Formularz otwierany z kliknięcia w slot. Dzień i godziny wchodzą automatycznie, więc operator nie walczy z czasem jak z bossem w pierwszym levelu."}>
              <form className="space-y-3" onSubmit={handleTaskSubmit}>
                <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
                  Wybrany slot: <span className="font-medium text-foreground">{form.date}</span> · <span className="font-medium text-foreground">{form.startTime}</span> → <span className="font-medium text-foreground">{form.endTime}</span>
                </div>

                <Field
                  label="Typ zadania"
                  helper={taskContextMode === "subscriber_prefill" ? `Formularz otwarty z kartoteki abonenta. Typ zadania jest zablokowany na trybie "na abonencie", żeby operator nie wybierał tej samej osoby dwa razy.` : undefined}
                >
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["internal", "Wewnętrzne ISP"],
                      ["subscriber", "Na abonencie"],
                    ] as Array<[TaskKind, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          if (taskContextMode === "subscriber_prefill") return;
                          setForm((prev) => ({ ...prev, kind: value }));
                        }}
                        className={[
                          "rounded-md border px-3 py-2 text-sm transition",
                          form.kind === value ? "bg-muted/60" : "hover:bg-muted/40",
                          taskContextMode === "subscriber_prefill" ? "cursor-not-allowed opacity-70" : "",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>

                {form.kind === "subscriber" && (
                  <>
                    <Field label="Abonent" helper={taskContextMode === "subscriber_prefill" ? "Kontekst pobrany z karty abonenta. Tutaj tylko pokazujemy, na kim zakładamy zadanie." : undefined}>
                      <select
                        value={form.subscriberId}
                        onChange={(e) => setForm((prev) => ({ ...prev, subscriberId: e.target.value }))}
                        disabled={taskContextMode === "subscriber_prefill"}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {subscribers.map((subscriber) => (
                          <option key={subscriber.id} value={subscriber.id}>
                            {subscriber.display_name} ({subscriber.id})
                          </option>
                        ))}
                      </select>
                    </Field>

                    {selectedSubscriber && (
                      <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{selectedSubscriber.display_name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{selectedSubscriber.id} • {selectedSubscriber.phone || "brak telefonu"}</div>
                          </div>
                          <Link href={`/subscribers/${selectedSubscriber.id}`} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/40">
                            Otwórz kartę abonenta
                          </Link>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {selectedSubscriber.addresses?.[0]
                            ? `${selectedSubscriber.addresses[0].city}, ${selectedSubscriber.addresses[0].street} ${selectedSubscriber.addresses[0].building_no}${selectedSubscriber.addresses[0].apartment_no ? `/${selectedSubscriber.addresses[0].apartment_no}` : ""}`
                            : "Brak adresu w mocku"}
                        </div>
                      </div>
                    )}
                  </>
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
                  <Field label="Od" helper="Pełne godziny, bez połówek.">
                    <TextInput type="time" step={3600} value={form.startTime} onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value.slice(0, 2) + ":00" }))} />
                  </Field>
                  <Field label="Do" helper="Minimalny czas zadania to 1 pełna godzina.">
                    <TextInput type="time" step={3600} value={form.endTime} onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value.slice(0, 2) + ":00" }))} />
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

                <Field label="Tryb przypisania" helper="Zespół oznacza ekipę logiczną. W kalendarzu zadanie i tak wpada wszystkim członkom ekipy, ale źródłem przypisania zostaje team.">
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
                  <Field label="Przypisane zespoły" helper={permissionMode.canAssignOthers ? "Możesz zaznaczyć jedną lub więcej ekip." : "Tryb self-only nie pozwala przypinać ekip."}>
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
                        : "Tryb self-only: zwykły pracownik dodaje zadanie tylko sobie."
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

                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={!form.title.trim() || !form.description.trim()} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50">
                    {leftPanelMode === "edit" ? "Zapisz zadanie" : "Dodaj zadanie"}
                  </button>
                  <button type="button" onClick={resetForm} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                    Zamknij formularz
                  </button>
                </div>
              </form>
            </Card>
          )}

          <Card title="Szybki podgląd konfiguracji" desc="Tu tylko teaser. Pełne edytowalne okna siedzą w Konfiguracja → Zadania, żeby operacja i konfiguracja nie gryzły się jak dwa routery na tym samym adresie IP.">
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border p-3">Ekipy aktywne: {teams.length}</div>
              <div className="rounded-lg border p-3">Kategorie automatyczne: {autoCategories.length}</div>
              <div className="rounded-lg border p-3">Definicje okien: {windows.length}</div>
              <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                Kolory bloków: otwarte = jasna czerwień, przeterminowane = ciemniejsza czerwień, zamknięte = jasna zieleń.
              </div>
            </div>
          </Card>
        </div>

        <Card title="Kalendarz tygodniowy 7 dni / 24h" desc={`Widok od ${formatDateKey(days[0])} do ${formatDateKey(days[6])}. Klik w siatkę = nowe zadanie, klik w blok = edycja dla uprawnionych, dwuklik = szczegóły, drag&drop = zmiana czasu.`}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div className="rounded-full border border-red-300 bg-red-100 px-3 py-1">otwarte</div>
            <div className="rounded-full border border-red-700/50 bg-red-300 px-3 py-1 text-red-950">przeterminowane</div>
            <div className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-emerald-950">zamknięte</div>
            <div className="ml-auto rounded-full border px-3 py-1">Widok: {selectedViewTargetLabel}</div>
          </div>

          {permissionMode.canAssignOthers ? (
            <div className="mb-4 rounded-2xl border bg-muted/20 p-3">
              <div className="text-sm font-medium">Pokaż kalendarz dla osoby / ekipy</div>
              <div className="mt-1 text-xs text-muted-foreground">Każdy pracownik ma własny kalendarz, a ekipa działa jak nakładka logiczna. Dzięki temu koordynator nie wrzuca zadań w ciemno na ten sam czas.</div>
              <select
                value={`${calendarViewTarget.type}:${calendarViewTarget.id}`}
                onChange={(e) => {
                  const [type, id] = e.target.value.split(":");
                  if (type === "team") {
                    setCalendarViewTarget({ type: "team", id });
                    return;
                  }
                  setCalendarViewTarget({ type: "staff", id });
                }}
                className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm sm:max-w-md"
              >
                <optgroup label="Pracownicy">
                  {staff.map((member) => (
                    <option key={`staff:${member.id}`} value={`staff:${member.id}`}>
                      {member.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Ekipy">
                  {teams.map((team) => (
                    <option key={`team:${team.id}`} value={`team:${team.id}`}>
                      {team.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          ) : null}
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
                    <div
                      key={key}
                      className="relative border-r last:border-r-0"
                      style={{ height: `${DAY_HEIGHT}px` }}
                      onClick={(event) => handleCalendarCellClick(key, event)}
                      onDragOver={(event) => {
                        if (permissionMode.canEditExisting) event.preventDefault();
                      }}
                      onDrop={(event) => handleTaskDrop(key, event)}
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <div key={`${key}-${hour}`} className="absolute inset-x-0 border-b" style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }} />
                      ))}

                      {items.map((task) => {
                        const top = (parseMinutes(task.startAt) / 60) * HOUR_HEIGHT;
                        const rawHeight = ((parseMinutes(task.endAt) - parseMinutes(task.startAt)) / 60) * HOUR_HEIGHT;
                        const height = Math.max(rawHeight, 52);
                        return (
                          <button
                            key={task.id}
                            type="button"
                            data-task-card="true"
                            draggable={permissionMode.canEditExisting}
                            onDragStart={() =>
                              setDragTaskState({
                                taskId: task.id,
                                durationMinutes: parseMinutes(task.endAt) - parseMinutes(task.startAt),
                              })
                            }
                            onDragEnd={() => setDragTaskState(null)}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedTaskId(task.id);
                              setDraftCompletion(task.completionNote ?? "");
                              if (permissionMode.canEditExisting) {
                                openEditPanel(task.id);
                              }
                            }}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              openTaskDetails(task.id);
                            }}
                            className={[
                              "absolute left-1 right-1 rounded-xl border p-2 text-left shadow-sm transition hover:brightness-[0.98]",
                              taskSurfaceClass(task, selectedTaskId === task.id),
                              permissionMode.canEditExisting ? "cursor-move" : "cursor-pointer",
                            ].join(" ")}
                            style={{ top: `${top}px`, height: `${height}px` }}
                          >
                            <div className="pr-4 text-xs font-semibold leading-tight">{task.title}</div>
                            <div className="mt-1 text-[11px] opacity-80">
                              {formatTime(task.startAt)}–{formatTime(task.endAt)}
                            </div>
                            <div className="mt-1 text-[11px] opacity-80 line-clamp-2">{task.kind === "subscriber" ? task.subscriberName : "Wewnętrzne ISP"}</div>
                            <div className="mt-1 text-[11px] opacity-80 line-clamp-1">{task.assignedTeamNames.join(", ") || getStaffLabel(task.assignedStaffIds)}</div>
                            {permissionMode.canEditExisting ? (
                              <span
                                className="absolute bottom-1 left-1/2 h-2 w-10 -translate-x-1/2 cursor-ns-resize rounded-full border border-current/25 bg-background/60"
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  setSelectedTaskId(task.id);
                                  setResizeTaskState({
                                    taskId: task.id,
                                    dayKey: key,
                                    startMinutes: parseMinutes(task.startAt),
                                    initialDurationMinutes: parseMinutes(task.endAt) - parseMinutes(task.startAt),
                                    startClientY: event.clientY,
                                  });
                                }}
                              />
                            ) : null}
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
          <div
            ref={detailCardRef}
            className={[
              "rounded-2xl border bg-card p-4 transition",
              detailPulse ? "ring-2 ring-primary/30" : "",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Szczegóły zadania</div>
                <div className="mt-1 text-xs text-muted-foreground">Kliknięcie bloku pokazuje kartę, a dwuklik przewija i akcentuje szczegóły. Dzięki temu operator nie poluje wzrokiem po całym ekranie jak na zagubionego Pokémona.</div>
              </div>
            </div>

            <div className="mt-4">
              {!selectedTask ? (
                <div className="text-sm text-muted-foreground">Wybierz zadanie z kalendarza.</div>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold">{selectedTask.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{selectedTask.kind === "subscriber" ? `Abonent: ${selectedTask.subscriberName}` : "Wewnętrzne Gemini / ISP"}</div>
                      {selectedTask.kind === "subscriber" && selectedTask.subscriberId ? (
                        <Link href={`/subscribers/${selectedTask.subscriberId}`} className="mt-2 inline-flex rounded-md border px-2 py-1 text-xs hover:bg-muted/40">
                          Otwórz kartę abonenta
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={["inline-flex rounded-md border px-2 py-1 text-xs font-medium", priorityBadge(selectedTask.priority)].join(" ")}>{priorityLabel(selectedTask.priority)}</span>
                      <span className={["inline-flex rounded-md border px-2 py-1 text-xs font-medium", statusBadge(selectedTask.status)].join(" ")}>{statusLabel(selectedTask.status)}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Zakres czasu</div>
                    <div className="mt-1 font-medium">
                      {formatDateTime(selectedTask.startAt)} → {formatDateTime(selectedTask.endAt)}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {permissionMode.canEditExisting ? "Masz tryb edycji: kliknięcie bloku otwiera formularz po lewej, a dodatkowo możesz przeciągać blok po kalendarzu albo łapać dolny uchwyt, żeby wydłużyć / skrócić zadanie. Po akcji UI pyta o potwierdzenie." : "Tryb bez edycji: możesz przeglądać, ale blok nie da się przesuwać ani rozciągać."}
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
                      <div className="mt-1 text-xs text-muted-foreground">Zamknięcie wymaga opisu wykonania. Bez tego historia byłaby tylko cyfrowym wzruszeniem ramion.</div>
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
            </div>
          </div>

          <Card title="Wolne sloty widoczne dla klienta" desc="Klient nie ogląda kalendarza pracowników, tylko sloty policzone z okien, ekip i zajętości. To tutaj rodzi się mniej chaosu i mniej telefonu z pytaniem, czemu system pokazał termin ducha.">
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
