"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type Item = { label: string; href: string };
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

  const sections: Section[] = useMemo(
    () => [
      {
        label: "Pracownicy",
        key: "staff",
        items: [
          { label: "Lista pracowników", href: "/staff" },
          { label: "Dodaj pracownika", href: "/staff/new" },
          { label: "Uprawnienia", href: "/permissions" },
          { label: "Ustawienia", href: "/settings" },
        ],
      },
      {
        label: "Umowy",
        key: "contracts",
        items: [{ label: "Lista (placeholder)", href: "/contracts" }],
      },
      {
        label: "Usługi",
        key: "services",
        items: [{ label: "Lista (placeholder)", href: "/services" }],
      },
      {
        label: "Klienci",
        key: "clients",
        items: [{ label: "Lista (placeholder)", href: "/clients" }],
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
    ],
    []
  );

  // otwieramy sekcję automatycznie, jeśli aktualny path do niej pasuje
  const autoOpenKey = useMemo(() => {
    if (pathname.startsWith("/staff")) return "staff";
    if (pathname.startsWith("/permissions")) return "staff";
    if (pathname.startsWith("/settings")) return "staff";
    if (pathname.startsWith("/contracts")) return "contracts";
    if (pathname.startsWith("/services")) return "services";
    if (pathname.startsWith("/clients")) return "clients";
    if (pathname.startsWith("/olt")) return "olt";
    if (pathname.startsWith("/networks")) return "networks";
    return null;
  }, [pathname]);

  const [open, setOpen] = useState<Record<string, boolean>>(() => ({
    staff: autoOpenKey === "staff",
    contracts: autoOpenKey === "contracts",
    services: autoOpenKey === "services",
    clients: autoOpenKey === "clients",
    olt: autoOpenKey === "olt",
    networks: autoOpenKey === "networks",
  }));

  // jeśli wejdziemy w nową sekcję — otwórz ją
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
              <span className="text-xs text-muted-foreground">
                {open[s.key] ? "–" : "+"}
              </span>
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
