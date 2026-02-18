"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type ApiStatus = "unknown" | "ok" | "down" | "unauthorized";

function formatPL(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function Header() {
  const { token, logout } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [status, setStatus] = useState<ApiStatus>("unknown");

  // zegar lokalny
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ping statusu API (lekko: co 15s)
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        await apiFetch<{ status: string }>("/health", {
          method: "GET",
          token,
          onUnauthorized: () => {
            if (cancelled) return;
            setStatus("unauthorized");
            logout();
          },
        });
        if (!cancelled) setStatus("ok");
      } catch (e: any) {
        const code = e?.status;
        if (!cancelled) {
          if (code === 401) setStatus("unauthorized");
          else setStatus("down");
        }
      }
    }

    ping();
    const id = setInterval(ping, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, logout]);

  const badge = useMemo(() => {
    const common = "inline-flex items-center rounded-md px-2 py-1 text-xs border";
    if (status === "ok") return <span className={`${common} border-border bg-muted`}>API: OK</span>;
    if (status === "unauthorized") return <span className={`${common} border-destructive/40 bg-destructive/10`}>API: 401</span>;
    if (status === "down") return <span className={`${common} border-destructive/40 bg-destructive/10`}>API: DOWN</span>;
    return <span className={`${common} border-border bg-card`}>API: ...</span>;
  }, [status]);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-baseline gap-3">
          <div className="text-sm font-semibold">CRM Panel Główny</div>
          <div className="text-xs text-muted-foreground">{formatPL(now)}</div>
        </div>

        <div className="flex items-center gap-3">
          {badge}
          <div className="text-xs text-muted-foreground">v0 (MVP)</div>
        </div>
      </div>

     
    </header>
  );
}
