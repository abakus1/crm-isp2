"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type StaffCreateRequest = {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone_company?: string | null;
};

type StaffCreateResponse = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  username: string;
  email?: string | null;
  phone_company?: string | null;
  role: string;
  status: string;
};

export default function StaffNewPage() {
  const { token, logout } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCompany, setPhoneCompany] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      username.trim().length > 0 &&
      email.trim().length > 0 &&
      !busy
    );
  }, [firstName, lastName, username, email, busy]);

  function handleUnauthorized() {
    logout();
    router.replace("/login");
  }

  async function handleCreate() {
    setError(null);
    setSuccess(null);
    setBusy(true);

    const payload: StaffCreateRequest = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      username: username.trim(),
      email: email.trim(),
      phone_company: phoneCompany.trim() ? phoneCompany.trim() : null,
    };

    try {
      const created = await apiFetch<StaffCreateResponse>("/staff", {
        method: "POST",
        token,
        body: payload,
        onUnauthorized: handleUnauthorized,
      });

      setSuccess(
        `Utworzono pracownika "${created.last_name || ""} ${created.first_name || ""}" (${created.username}). Startuje bez stanowiska (unassigned) — nadaj uprawnienia w Szczegółach.`
      );

      setTimeout(() => {
        router.replace(`/staff/${created.id}`);
      }, 700);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd tworzenia pracownika");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Dodaj pracownika</div>
          <div className="text-xs text-muted-foreground">
            System wygeneruje hasło tymczasowe i (jeśli mailer włączony) wyśle je na e-mail.
            Nowy pracownik startuje bez stanowiska i bez dostępu do modułów — dopiero po
            przypisaniu roli/stanowiska i ewentualnych override może pracować.
          </div>
        </div>

        <Link
          href="/staff"
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
        >
          ← Wróć do listy
        </Link>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-xs">{error}</div>}
      {success && <div className="rounded-md bg-emerald-500/10 p-3 text-xs">{success}</div>}

      <div className="rounded-xl border border-border bg-card">
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Imię *</label>
            <input
              type="text"
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="np. Jan"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Nazwisko *</label>
            <input
              type="text"
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="np. Kowalski"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Login *</label>
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
            <label className="block text-xs text-muted-foreground mb-1">Email prywatny *</label>
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
            <label className="block text-xs text-muted-foreground mb-1">Numer telefonu firmowego</label>
            <input
              type="text"
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={phoneCompany}
              onChange={(e) => setPhoneCompany(e.target.value)}
              placeholder="np. +48 600 000 000"
            />
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