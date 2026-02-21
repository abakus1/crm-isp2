"use client";

import type { ReactNode } from "react";

export function Pill({ tone, text }: { tone: "ok" | "warn" | "muted"; text: string }) {
  const base =
    "inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] leading-4";
  const cls =
    tone === "ok"
      ? "bg-emerald-500/10"
      : tone === "warn"
      ? "bg-amber-500/10"
      : "bg-muted/40";
  return <span className={`${base} ${cls}`}>{text}</span>;
}

export function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-9 rounded-md border px-3 text-sm",
        active
          ? "border-border bg-background"
          : "border-transparent bg-muted/40 hover:bg-muted/60",
      ].join(" ")}
    >
      {children}
    </button>
  );
}