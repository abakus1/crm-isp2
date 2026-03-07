import { seedTaskStaff, seedTasks, type MockTask } from "@/lib/mockTasks";

export type AutoTaskCode = "connection" | "failure" | "service_visit" | "dismantle";

export type MockTaskTeam = {
  id: string;
  name: string;
  description: string;
  memberStaffIds: string[];
  supportedAutoTaskCodes: AutoTaskCode[];
  active: boolean;
};

export type MockAutoTaskCategory = {
  id: string;
  code: AutoTaskCode;
  name: string;
  description: string;
  clientBookable: boolean;
  active: boolean;
  allowedWindowIds: string[];
  eligibleTeamIds: string[];
};

export type MockWindowDefinition = {
  id: string;
  name: string;
  taskCodes: AutoTaskCode[];
  daysOfWeek: number[]; // 1=Mon ... 7=Sun
  startHour: number;
  endHour: number;
  slotDurationMinutes: number;
  parallelSlots: number;
  active: boolean;
};

export type MockWorkScheduleTemplate = {
  id: string;
  name: string;
  description: string;
  entries: Array<{
    dayOfWeek: number;
    startHour: number;
    endHour: number;
  }>;
};

export type MockStaffScheduleAssignment = {
  id: string;
  staffId: string;
  templateId: string;
  validFrom: string;
  validTo: string | null;
};

export type MockClientVisibleSlot = {
  slotId: string;
  windowId: string;
  categoryCode: AutoTaskCode;
  startsAt: string;
  endsAt: string;
  remainingCapacity: number;
  eligibleTeamNames: string[];
};

export function seedTaskTeams(): MockTaskTeam[] {
  return [
    {
      id: "team_install_1",
      name: "Ekipa monterska 1",
      description: "Podłączenia FTTH / ONT / aktywacje podstawowe.",
      memberStaffIds: ["staff_01", "staff_05"],
      supportedAutoTaskCodes: ["connection", "dismantle"],
      active: true,
    },
    {
      id: "team_service_1",
      name: "Serwis Kraków",
      description: "Awarie, wizyty techniczne, STB, problemy lokalne.",
      memberStaffIds: ["staff_02", "staff_05"],
      supportedAutoTaskCodes: ["failure", "service_visit", "dismantle"],
      active: true,
    },
    {
      id: "team_bok_ops",
      name: "BOK / Operacje",
      description: "Koordynacja terminów i zadania wewnętrzne.",
      memberStaffIds: ["staff_03", "staff_04"],
      supportedAutoTaskCodes: ["service_visit"],
      active: true,
    },
  ];
}

export function seedAutoTaskCategories(): MockAutoTaskCategory[] {
  return [
    {
      id: "auto_connection",
      code: "connection",
      name: "Podłączenie",
      description: "Automatyczne umawianie pierwszej instalacji / aktywacji.",
      clientBookable: true,
      active: true,
      allowedWindowIds: ["window_connection_4h"],
      eligibleTeamIds: ["team_install_1"],
    },
    {
      id: "auto_failure",
      code: "failure",
      name: "Awaria",
      description: "Termin wizyty technicznej zgłaszanej przez klienta lub BOK.",
      clientBookable: true,
      active: true,
      allowedWindowIds: ["window_service_hourly"],
      eligibleTeamIds: ["team_service_1"],
    },
    {
      id: "auto_service_visit",
      code: "service_visit",
      name: "Wizyta serwisowa",
      description: "Prace techniczne, kontrola, diagnostyka, STB/ONT.",
      clientBookable: true,
      active: true,
      allowedWindowIds: ["window_service_hourly"],
      eligibleTeamIds: ["team_service_1", "team_bok_ops"],
    },
    {
      id: "auto_dismantle",
      code: "dismantle",
      name: "Demontaż",
      description: "Odbiór urządzeń i zamknięcie świadczenia w terenie.",
      clientBookable: false,
      active: true,
      allowedWindowIds: ["window_service_hourly"],
      eligibleTeamIds: ["team_install_1", "team_service_1"],
    },
  ];
}

export function seedWindowDefinitions(): MockWindowDefinition[] {
  return [
    {
      id: "window_connection_4h",
      name: "Podłączenia 4h",
      taskCodes: ["connection"],
      daysOfWeek: [1, 2, 3, 4, 5],
      startHour: 8,
      endHour: 12,
      slotDurationMinutes: 240,
      parallelSlots: 1,
      active: true,
    },
    {
      id: "window_service_hourly",
      name: "Serwis 1h",
      taskCodes: ["failure", "service_visit", "dismantle"],
      daysOfWeek: [1, 2, 3, 4, 5],
      startHour: 8,
      endHour: 19,
      slotDurationMinutes: 60,
      parallelSlots: 1,
      active: true,
    },
  ];
}

export function seedWorkScheduleTemplates(): MockWorkScheduleTemplate[] {
  const weekdays = [1, 2, 3, 4, 5];
  return [
    {
      id: "tpl_regular_8_16",
      name: "Stały 08:00–16:00",
      description: "Cały miesiąc na tych samych godzinach.",
      entries: weekdays.map((dayOfWeek) => ({ dayOfWeek, startHour: 8, endHour: 16 })),
    },
    {
      id: "tpl_regular_11_19",
      name: "Stały 11:00–19:00",
      description: "Druga zmiana, dobra do popołudniowego serwisu.",
      entries: weekdays.map((dayOfWeek) => ({ dayOfWeek, startHour: 11, endHour: 19 })),
    },
    {
      id: "tpl_rotating_demo",
      name: "Rotacja demo 08:00/11:00",
      description: "Mock rotacji tygodniowej — dziś uproszczone, ale UI już wie o co chodzi.",
      entries: weekdays.map((dayOfWeek, index) => ({ dayOfWeek, startHour: index % 2 === 0 ? 8 : 11, endHour: index % 2 === 0 ? 16 : 19 })),
    },
  ];
}

export function seedStaffScheduleAssignments(): MockStaffScheduleAssignment[] {
  return [
    {
      id: "staff_schedule_01",
      staffId: "staff_01",
      templateId: "tpl_regular_8_16",
      validFrom: "2026-03-01",
      validTo: null,
    },
    {
      id: "staff_schedule_02",
      staffId: "staff_02",
      templateId: "tpl_regular_11_19",
      validFrom: "2026-03-01",
      validTo: null,
    },
    {
      id: "staff_schedule_03",
      staffId: "staff_03",
      templateId: "tpl_regular_8_16",
      validFrom: "2026-03-01",
      validTo: null,
    },
    {
      id: "staff_schedule_04",
      staffId: "staff_04",
      templateId: "tpl_regular_8_16",
      validFrom: "2026-03-01",
      validTo: null,
    },
    {
      id: "staff_schedule_05",
      staffId: "staff_05",
      templateId: "tpl_rotating_demo",
      validFrom: "2026-03-01",
      validTo: null,
    },
  ];
}

function buildDateTime(baseDate: string, minutes: number) {
  const hours = `${Math.floor(minutes / 60)}`.padStart(2, "0");
  const mins = `${minutes % 60}`.padStart(2, "0");
  return `${baseDate}T${hours}:${mins}:00`;
}

function getIsoDateFromTask(task: MockTask) {
  return task.startAt.slice(0, 10);
}

function overlaps(task: MockTask, fromIso: string, toIso: string) {
  return task.startAt < toIso && task.endAt > fromIso;
}

export function getClientVisibleSlots(baseDate = "2026-03-10", categoryCode: AutoTaskCode = "service_visit"): MockClientVisibleSlot[] {
  const categories = seedAutoTaskCategories();
  const category = categories.find((item) => item.code === categoryCode);
  if (!category) return [];

  const windows = seedWindowDefinitions().filter((item) => category.allowedWindowIds.includes(item.id) && item.active);
  const teams = seedTaskTeams();
  const tasks = seedTasks();

  const date = new Date(`${baseDate}T08:00:00`);
  const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();

  const result: MockClientVisibleSlot[] = [];

  for (const windowDef of windows) {
    if (!windowDef.daysOfWeek.includes(dayOfWeek)) continue;
    const eligibleTeams = teams.filter((team) => category.eligibleTeamIds.includes(team.id) && team.active);
    for (let minute = windowDef.startHour * 60; minute + windowDef.slotDurationMinutes <= windowDef.endHour * 60; minute += windowDef.slotDurationMinutes) {
      const startsAt = buildDateTime(baseDate, minute);
      const endsAt = buildDateTime(baseDate, minute + windowDef.slotDurationMinutes);
      const busyEligibleTeams = eligibleTeams.filter((team) =>
        tasks.some((task) => task.assignedTeamIds?.includes(team.id) && overlaps(task, startsAt, endsAt))
      );
      const remainingCapacity = Math.max(Math.min(windowDef.parallelSlots, eligibleTeams.length) - busyEligibleTeams.length, 0);
      if (remainingCapacity > 0) {
        result.push({
          slotId: `${windowDef.id}_${minute}`,
          windowId: windowDef.id,
          categoryCode,
          startsAt,
          endsAt,
          remainingCapacity,
          eligibleTeamNames: eligibleTeams.map((team) => team.name),
        });
      }
    }
  }

  return result;
}

export function getTeamLabel(teamIds: string[]) {
  const teams = seedTaskTeams();
  return teams
    .filter((team) => teamIds.includes(team.id))
    .map((team) => team.name)
    .join(", ");
}

export function getScheduleTemplateLabel(templateId: string | null | undefined) {
  if (!templateId) return "—";
  return seedWorkScheduleTemplates().find((item) => item.id === templateId)?.name ?? templateId;
}

export function getTaskLoadForDay(date: string) {
  return seedTasks().filter((task) => getIsoDateFromTask(task) === date);
}

export function getTaskTeamsForStaff(staffId: string) {
  return seedTaskTeams().filter((team) => team.memberStaffIds.includes(staffId));
}

export function getStaffName(staffId: string) {
  return seedTaskStaff().find((item) => item.id === staffId)?.name ?? staffId;
}
