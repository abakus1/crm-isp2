// frontend/crm-web/src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type LoginResp = {
  access_token: string;
  token_type?: string;
  must_change_credentials?: boolean;
  mfa_required?: boolean;
  setup_mode?: boolean;
  bootstrap_mode?: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const { setToken } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const data = await apiFetch<LoginResp>("/identity/login", {
        method: "POST",
        body: JSON.stringify({ username, password, totp_code: totp || null }),
      });

      setToken(data.access_token);

      if (data.bootstrap_mode) {
        router.replace("/bootstrap");
      } else if (data.setup_mode) {
        router.replace("/setup");
      } else {
        router.replace("/dashboard");
      }
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="text-sm font-semibold">Logowanie</div>
        <div className="text-xs text-muted-foreground mb-4">CRM Cockpit (MVP)</div>

        {error && (
          <div className="mb-3 rounded-md bg-destructive/10 p-3 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Username</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">TOTP (jeśli wymagane)</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
            />
          </div>

          <button
            disabled={busy}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Loguję..." : "Zaloguj"}
          </button>
        </form>

        <div className="mt-3 text-xs text-muted-foreground">
          401/403/allowlist/lockout pokażemy jako komunikaty z API.
        </div>
      </div>
    </div>
  );
}
