"use client";

import { useMemo } from "react";

import { getScheduleTemplateLabel, seedStaffScheduleAssignments, seedWorkScheduleTemplates } from "@/lib/mockTaskConfig";
import { seedTaskStaff } from "@/lib/mockTasks";

function hour(value: number) {
  return `${String(value).padStart(2, "0")}:00`;
}

export default function TaskWorkSchedulesConfigPage() {
  const staff = useMemo(() => seedTaskStaff(), []);
  const templates = useMemo(() => seedWorkScheduleTemplates(), []);
  const assignments = useMemo(() => seedStaffScheduleAssignments(), []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → Zadania → Czas pracy</div>
        <div className="text-xs text-muted-foreground">
          Szablony pracy i przypięcie do ludzi. Bez tej warstwy system pokazywałby klientowi terminy z równoległego wszechświata.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-2xl border bg-card p-4">
              <div className="text-sm font-semibold">{template.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{template.description}</div>
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {template.entries.map((entry, index) => (
                  <div key={`${template.id}_${index}`} className="rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">Dzień {entry.dayOfWeek}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{hour(entry.startHour)} → {hour(entry.endHour)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="text-sm font-semibold">Przypięcie szablonów do pracowników</div>
          <div className="mt-4 space-y-3">
            {assignments.map((assignment) => {
              const member = staff.find((item) => item.id === assignment.staffId);
              return (
                <div key={assignment.id} className="rounded-xl border p-3">
                  <div className="text-sm font-semibold">{member?.name ?? assignment.staffId}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{member?.team} · {member?.role}</div>
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                      <div className="text-xs text-muted-foreground">Szablon</div>
                      <div className="mt-1 font-medium">{getScheduleTemplateLabel(assignment.templateId)}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                      <div className="text-xs text-muted-foreground">Obowiązuje</div>
                      <div className="mt-1 font-medium">{assignment.validFrom} → {assignment.validTo ?? "bez końca"}</div>
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
