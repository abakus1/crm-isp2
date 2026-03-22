"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { usePermissions } from "@/lib/permissions";

type Item = { label: string; href: string; requireAny?: string[] };
type Group = { label: string; key: string; items: Item[] };
type Section = { label: string; key: string; items?: Item[]; groups?: Group[] };

function NavLink({ href, label, compact = false }: { href: string; label: string; compact?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "block rounded-md text-sm",
        compact ? "px-2.5 py-1.5" : "px-3 py-2",
        active ? "bg-muted/60 font-medium" : "hover:bg-muted/40",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function ConfigGroupBlock({ group }: { group: Group }) {
  return (
    <div className="space-y-1 rounded-lg border border-border/70 bg-background/50 p-2">
      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {group.label}
      </div>
      <div className="space-y-1">
        {group.items.map((it) => (
          <NavLink key={it.href} href={it.href} label={it.label} compact />
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const perms = usePermissions();

  const rawSections: Section[] = useMemo(
    () => [
      {
        label: "Pracownicy",
        key: "staff",
        items: [
          { label: "Lista pracowników", href: "/staff", requireAny: ["staff.list"] },
          { label: "Dodaj pracownika", href: "/staff/new", requireAny: ["staff.create"] },
        ],
      },
      {
        label: "Zadania",
        key: "tasks",
        items: [{ label: "Kalendarz i lista", href: "/tasks" }],
      },
      {
        label: "Umowy",
        key: "contracts",
        items: [{ label: "Lista (placeholder)", href: "/contracts", requireAny: ["contracts.read"] }],
      },
      {
        label: "Usługi",
        key: "services",
        items: [{ label: "Lista (placeholder)", href: "/services" }],
      },
      {
        label: "Abonenci",
        key: "subscribers",
        items: [
          { label: "Lista abonentów", href: "/subscribers", requireAny: ["subscribers.read"] },
          { label: "Dodaj abonenta", href: "/subscribers/new", requireAny: ["subscribers.create"] },
        ],
      },
      {
        label: "OLT",
        key: "olt",
        items: [{ label: "Dashboard (placeholder)", href: "/olt" }],
      },
      {
        label: "Sieci",
        key: "networks",
        items: [{ label: "Widok (placeholder)", href: "/networks" }],
      },
      {
        label: "Konfiguracja",
        key: "config",
        groups: [
          {
            label: "Usługi",
            key: "config-services",
            items: [
              { label: "Usługi", href: "/config/services" },
              {
                label: "Katalog",
                href: "/config/catalog",
                requireAny: ["catalog.products.read", "catalog.requirements.read", "catalog.requirements.write"],
              },
            ],
          },
          {
            label: "Zadania",
            key: "config-tasks",
            items: [
              { label: "Zespoły", href: "/config/tasks/teams" },
              { label: "Kategorie automatyczne", href: "/config/tasks/categories" },
              { label: "Okna czasowe", href: "/config/tasks/windows" },
              { label: "Czas pracy", href: "/config/tasks/work-schedules" },
            ],
          },
          {
            label: "Infrastruktura",
            key: "config-infra",
            items: [
              { label: "Magazyn urządzeń", href: "/config/inventory" },
              { label: "Magazyn IP", href: "/config/ip" },
              {
                label: "PRG",
                href: "/config/prg",
                requireAny: [
                  "prg.import.run",
                  "prg.local_point.create",
                  "prg.local_point.edit",
                  "prg.local_point.delete",
                  "prg.local_point.approve",
                  "prg.reconcile.run",
                ],
              },
              { label: "Zasięgi", href: "/config/coverage" },
            ],
          },
          {
            label: "Komunikacja",
            key: "config-comms",
            items: [
              { label: "SMS", href: "/config/sms", requireAny: ["sms.config.read", "sms.config.write"] },
            ],
          },
          {
            label: "System",
            key: "config-system",
            items: [
              { label: "Uprawnienia", href: "/permissions", requireAny: ["rbac.roles.list", "rbac.actions.list"] },
              { label: "Ustawienia", href: "/settings" },
            ],
          },
        ],
      },
    ],
    []
  );

  const sections: Section[] = useMemo(() => {
    if (!perms.loaded || !perms.role) return rawSections;

    const canSee = (it: Item) => !it.requireAny || it.requireAny.length === 0 || perms.hasAny(it.requireAny);

    return rawSections
      .map((section) => {
        const items = section.items?.filter(canSee);
        const groups = section.groups
          ?.map((group) => ({ ...group, items: group.items.filter(canSee) }))
          .filter((group) => group.items.length > 0);

        return { ...section, items, groups };
      })
      .filter((section) => (section.items && section.items.length > 0) || (section.groups && section.groups.length > 0));
  }, [rawSections, perms.loaded, perms.role, perms]);

  const autoOpenKey = useMemo(() => {
    if (pathname.startsWith("/staff")) return "staff";
    if (pathname.startsWith("/tasks")) return "tasks";
    if (pathname.startsWith("/contracts")) return "contracts";
    if (pathname.startsWith("/services")) return "services";
    if (pathname.startsWith("/subscribers")) return "subscribers";
    if (pathname.startsWith("/olt")) return "olt";
    if (pathname.startsWith("/networks")) return "networks";
    if (pathname.startsWith("/config") || pathname.startsWith("/permissions") || pathname.startsWith("/settings")) return "config";
    return null;
  }, [pathname]);

  const [open, setOpen] = useState<Record<string, boolean>>(() => ({
    staff: autoOpenKey === "staff",
    tasks: autoOpenKey === "tasks",
    contracts: autoOpenKey === "contracts",
    services: autoOpenKey === "services",
    subscribers: autoOpenKey === "subscribers",
    olt: autoOpenKey === "olt",
    networks: autoOpenKey === "networks",
    config: autoOpenKey === "config",
  }));

  useEffect(() => {
    if (!autoOpenKey) return;
    setOpen((prev) => ({ ...prev, [autoOpenKey]: true }));
  }, [autoOpenKey]);

  function toggle(key: string) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <aside className="min-h-screen w-64 border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="text-sm font-semibold">CRM Cockpit</div>
        <div className="text-xs text-muted-foreground">ADMIN/STAFF</div>
      </div>

      <nav className="space-y-2 p-3">
        <NavLink href="/dashboard" label="Dashboard" />

        {sections.map((section) => (
          <div key={section.key} className="rounded-lg">
            <button
              type="button"
              onClick={() => toggle(section.key)}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/40"
            >
              <span>{section.label}</span>
              <span className="text-xs text-muted-foreground">{open[section.key] ? "–" : "+"}</span>
            </button>

            {open[section.key] && (
              <div className="mt-1 ml-2 space-y-2 border-l border-border pl-2">
                {section.items?.map((item) => (
                  <NavLink key={item.href} href={item.href} label={item.label} />
                ))}
                {section.groups?.map((group) => (
                  <ConfigGroupBlock key={group.key} group={group} />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
