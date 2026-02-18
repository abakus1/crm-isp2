"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type StaffCreateRequest = {
  username: string;
  email?: string | null;
  role: "staff" | "admin";
};

type StaffCreateResponse = {
  id: number;
  username: string;
  email?: string | null;
  role: string;
  status: string;
};

export default function StaffNewPage() {
  const { token, logout } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return username.trim().length > 0 && !busy;
  }, [username, busy]);

  function handleUnauthorized() {
    logout();
    router.replace("/login");
  }

  async function handleCreate() {
    setError(null);
    setSuccess(null);
    setBusy(true);

    const payload: StaffCreateRequest = {
      username: username.trim(),
      email: email.trim() ? email.trim() : null,
      role,
    };

    try {
      const created = await apiFetch<StaffCreateResponse>("/staff", {
        method: "POST",
        token,
        body: payload,
        onUnauthorized: handleUnauthorized,
      });

      setSuccess(
        `Utworzono użytkownika "${created.username}". Hasło tymczasowe zostało wysłane e-mailem (jeśli podany).`
      );

      // po sukcesie wracamy do listy
      setTimeout(() => {
        router.replace("/staff");
      }, 800);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd tworzenia pracownika");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Dodaj pracownika</div>
          <div className="text-xs text-muted-foreground">
            System wygeneruje hasło tymczasowe i wyśle je e-mailem.
            Pierwsze logowanie wymusi zmianę hasła i konfigurację TOTP.
          </div>
        </div>

        <Link
          href="/staff"
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
        >
          ← Wróć do listy
        </Link>
      </div>

      {/* Komunikaty */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-xs">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md bg-emerald-500/10 p-3 text-xs">
          {success}
        </div>
      )}

      {/* Formularz */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Username *
            </label>
            <input
              type="text"
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="np. jan.kowalski"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Email (prywatny)
            </label>
            <input
              type="email"
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="np. jan@gmail.com"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Rola
            </label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as "staff" | "admin")}
            >
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button
              onClick={handleCreate}
              disabled={!canSubmit}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              {busy ? "Tworzę..." : "Utwórz pracownika"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
