"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { usePermissions } from "@/lib/permissions";

type Item = { label: string; href: string; requireAny?: string[] };
type Section = { label: string; key: string; items: Item[] };

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "block rounded-md px-3 py-2 text-sm",
        active ? "bg-muted/60" : "hover:bg-muted/40",
      ].join(" ")}
    >
      {label}
    </Link>
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
        label: "Klienci",
        key: "clients",
        items: [{ label: "Lista (placeholder)", href: "/clients", requireAny: ["subscribers.read"] }],
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
        items: [
          {
            label: "Usługi",
            href: "/config/services",
            // permissions dopniemy później (ślepe UI)
          },
          {
            label: "Magazyn IP",
            href: "/config/ip",
            // UI-only: backend podepniemy później
          },
          {
            label: "Katalog",
            href: "/config/catalog",
            requireAny: ["catalog.products.read", "catalog.requirements.read", "catalog.requirements.write"],
          },
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
          {
            label: "Uprawnienia",
            href: "/permissions",
            requireAny: ["rbac.roles.list", "rbac.actions.list"],
          },
          { label: "Ustawienia", href: "/settings" },
        ],
      },
    ],
    []
  );

  const sections: Section[] = useMemo(() => {
    // zanim załadujemy permissions (np. świeży reload) — pokaż bez agresywnego ukrywania
    if (!perms.loaded || !perms.role) return rawSections;

    const canSee = (it: Item) => {
      if (!it.requireAny || it.requireAny.length === 0) return true;
      return perms.hasAny(it.requireAny);
    };

    return rawSections
      .map((s) => ({ ...s, items: s.items.filter(canSee) }))
      .filter((s) => s.items.length > 0);
  }, [rawSections, perms.loaded, perms.role, perms]);

  // auto-open
  const autoOpenKey = useMemo(() => {
    if (pathname.startsWith("/staff")) return "staff";
    if (pathname.startsWith("/contracts")) return "contracts";
    if (pathname.startsWith("/services")) return "services";
    if (pathname.startsWith("/clients")) return "clients";
    if (pathname.startsWith("/olt")) return "olt";
    if (pathname.startsWith("/networks")) return "networks";
    if (pathname.startsWith("/config") || pathname.startsWith("/permissions") || pathname.startsWith("/settings")) return "config";
    return null;
  }, [pathname]);

  const [open, setOpen] = useState<Record<string, boolean>>(() => ({
    staff: autoOpenKey === "staff",
    contracts: autoOpenKey === "contracts",
    services: autoOpenKey === "services",
    clients: autoOpenKey === "clients",
    olt: autoOpenKey === "olt",
    networks: autoOpenKey === "networks",
    config: autoOpenKey === "config",
  }));

  useMemo(() => {
    if (!autoOpenKey) return;
    setOpen((prev) => ({ ...prev, [autoOpenKey]: true }));
  }, [autoOpenKey]);

  function toggle(key: string) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <aside className="w-64 min-h-screen border-r border-border bg-card">
      <div className="p-4 border-b border-border">
        <div className="text-sm font-semibold">CRM Cockpit</div>
        <div className="text-xs text-muted-foreground">ADMIN/STAFF</div>
      </div>

      <nav className="p-3 space-y-2">
        <NavLink href="/dashboard" label="Dashboard" />

        {sections.map((s) => (
          <div key={s.key} className="rounded-lg">
            <button
              type="button"
              onClick={() => toggle(s.key)}
              className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/40"
            >
              <span>{s.label}</span>
              <span className="text-xs text-muted-foreground">{open[s.key] ? "–" : "+"}</span>
            </button>

            {open[s.key] && (
              <div className="mt-1 ml-2 pl-2 border-l border-border space-y-1">
                {s.items.map((it) => (
                  <NavLink key={it.href} href={it.href} label={it.label} />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
