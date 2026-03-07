import { seedSubscribers } from "@/lib/mockSubscribers";

export type TaskKind = "internal" | "subscriber";
export type TaskStatus = "planned" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type MockStaffMember = {
  id: string;
  name: string;
  team: string;
  role: string;
};

export type MockTask = {
  id: string;
  kind: TaskKind;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  subscriberId: string | null;
  subscriberName: string | null;
  assignedStaffIds: string[];
  assignedTeamIds?: string[];
  assignedTeamNames: string[];
  startAt: string;
  endAt: string;
  createdBy: string;
  completionNote: string | null;
  locationLabel?: string;
  source: "manual" | "bok" | "panel_klienta" | "manager";
};

export type PermissionPreview = {
  key: "self" | "manager";
  label: string;
  canAssignOthers: boolean;
  canEditExisting: boolean;
  canCloseAny: boolean;
  selfStaffId: string;
};

export const TASK_PERMISSION_PRESETS: PermissionPreview[] = [
  {
    key: "self",
    label: "Pracownik (tylko self-task)",
    canAssignOthers: false,
    canEditExisting: false,
    canCloseAny: false,
    selfStaffId: "staff_01",
  },
  {
    key: "manager",
    label: "Kierownik / koordynator",
    canAssignOthers: true,
    canEditExisting: true,
    canCloseAny: true,
    selfStaffId: "staff_03",
  },
];

export function seedTaskStaff(): MockStaffMember[] {
  return [
    { id: "staff_01", name: "Marek Instalator", team: "Instalacje", role: "technik" },
    { id: "staff_02", name: "Natalia Serwis", team: "Serwis", role: "technik" },
    { id: "staff_03", name: "Paweł Koordynator", team: "Operacje", role: "manager" },
    { id: "staff_04", name: "Julia BOK", team: "BOK", role: "bok" },
    { id: "staff_05", name: "Tomasz GPON", team: "Sieć", role: "network" },
  ];
}

function buildIso(date: string, time: string) {
  return `${date}T${time}:00`;
}

export function seedTasks(): MockTask[] {
  const subscribers = seedSubscribers();
  const jan = subscribers.find((item) => item.id === "sub_0001") ?? subscribers[0];
  const anna = subscribers.find((item) => item.id === "sub_0002") ?? subscribers[1] ?? subscribers[0];

  return [
    {
      id: "task_0001",
      kind: "subscriber",
      title: "Instalacja FTTH + ONT",
      description: "Montaż ONT, test sygnału, aktywacja internetu i przekazanie krótkiej instrukcji klientowi.",
      status: "planned",
      priority: "urgent",
      subscriberId: jan.id,
      subscriberName: jan.display_name,
      assignedStaffIds: ["staff_01", "staff_05"],
      assignedTeamIds: ["team_install_1"],
      assignedTeamNames: ["Ekipa monterska 1"],
      startAt: buildIso("2026-03-09", "09:00"),
      endAt: buildIso("2026-03-09", "11:30"),
      createdBy: "Paweł Koordynator",
      completionNote: null,
      locationLabel: "Kraków, ul. Promienistych 11/4",
      source: "bok",
    },
    {
      id: "task_0002",
      kind: "internal",
      title: "Przegląd zapasu ONT w magazynie",
      description: "Porównać wolne ONT z addonami i sprawdzić, czy nie trzeba zamówić kolejnej partii urządzeń.",
      status: "in_progress",
      priority: "normal",
      subscriberId: null,
      subscriberName: null,
      assignedStaffIds: ["staff_03"],
      assignedTeamIds: ["team_bok_ops"],
      assignedTeamNames: ["BOK / Operacje"],
      startAt: buildIso("2026-03-10", "08:30"),
      endAt: buildIso("2026-03-10", "10:00"),
      createdBy: "Paweł Koordynator",
      completionNote: null,
      source: "manager",
    },
    {
      id: "task_0003",
      kind: "subscriber",
      title: "Wizyta serwisowa — TV / STB",
      description: "Sprawdzić zawieszanie obrazu i logi dekodera AVIOS. Możliwa wymiana STB.",
      status: "done",
      priority: "high",
      subscriberId: anna.id,
      subscriberName: anna.display_name,
      assignedStaffIds: ["staff_02"],
      assignedTeamIds: ["team_service_1"],
      assignedTeamNames: ["Serwis Kraków"],
      startAt: buildIso("2026-03-11", "13:00"),
      endAt: buildIso("2026-03-11", "14:30"),
      createdBy: "Julia BOK",
      completionNote: "Zaktualizowano firmware STB, poprawiono połączenie LAN, klient potwierdził stabilny obraz.",
      locationLabel: "Kraków, ul. Długa 8",
      source: "panel_klienta",
    },
    {
      id: "task_0004",
      kind: "subscriber",
      title: "Podłączenie po zgodzie na wcześniejsze uruchomienie",
      description: "Okno instalacyjne uzgodnione telefonicznie. Upewnić się, że zgoda jest w dokumentach.",
      status: "planned",
      priority: "high",
      subscriberId: jan.id,
      subscriberName: jan.display_name,
      assignedStaffIds: ["staff_01"],
      assignedTeamIds: ["team_install_1"],
      assignedTeamNames: ["Ekipa monterska 1"],
      startAt: buildIso("2026-03-12", "15:00"),
      endAt: buildIso("2026-03-12", "17:00"),
      createdBy: "Julia BOK",
      completionNote: null,
      locationLabel: "Kraków, ul. Promienistych 11/4",
      source: "panel_klienta",
    },
    {
      id: "task_0005",
      kind: "internal",
      title: "Analiza reklamacji i korekt",
      description: "Przejrzeć reklamacje z tygodnia i przygotować listę spraw do rozliczeń / korekt.",
      status: "planned",
      priority: "normal",
      subscriberId: null,
      subscriberName: null,
      assignedStaffIds: ["staff_03", "staff_04"],
      assignedTeamIds: ["team_bok_ops"],
      assignedTeamNames: ["BOK / Operacje"],
      startAt: buildIso("2026-03-13", "10:00"),
      endAt: buildIso("2026-03-13", "11:00"),
      createdBy: "Paweł Koordynator",
      completionNote: null,
      source: "manager",
    },
  ];
}

export function getTasksForSubscriber(subscriberId: string): MockTask[] {
  return seedTasks()
    .filter((task) => task.subscriberId === subscriberId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function getStaffLabel(staffIds: string[]): string {
  const staff = seedTaskStaff();
  return staff
    .filter((member) => staffIds.includes(member.id))
    .map((member) => member.name)
    .join(", ");
}
