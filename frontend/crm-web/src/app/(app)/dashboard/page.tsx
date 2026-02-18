"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type WhoAmI = {
  staff_id: number;
  username: string;
  role: string;
  bootstrap_mode: boolean;
  setup_mode: boolean;
};

export default function DashboardPage() {
  const { token, logout } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<WhoAmI | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<WhoAmI>("/identity/whoami", {
          method: "GET",
          token,
          onUnauthorized: () => {
            logout();
            router.replace("/login");
          },
        });
        setMe(data);
      } catch (e: any) {
        const err = e as ApiError;
        setError(err.message || "Błąd /identity/whoami");
      }
    }
    if (token) load();
  }, [token, logout, router]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Dashboard</div>
        <div className="text-xs text-muted-foreground">Status sesji</div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-xs">{error}</div>}

      <div className="rounded-xl border border-border bg-card p-4">
        {!me ? (
          <div className="text-xs text-muted-foreground">Ładuję profil...</div>
        ) : (
          <div className="text-sm space-y-2">
            <div>
              <span className="text-xs text-muted-foreground">User:</span>{" "}
              <span className="font-medium">{me.username}</span>{" "}
              <span className="text-xs text-muted-foreground">(id {me.staff_id})</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Role:</span>{" "}
              <span className="font-medium">{me.role}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              setup_mode={String(me.setup_mode)} · bootstrap_mode={String(me.bootstrap_mode)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}