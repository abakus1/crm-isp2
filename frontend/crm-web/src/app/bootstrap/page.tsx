// frontend/crm-web/src/app/bootstrap/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";

import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type BootstrapResp = {
  status: string;
  admin_id: number;
  admin_username: string;
  totp_secret: string;
  totp_uri: string;
  bootstrap_required: boolean;
  completed_at?: string | null;
  next?: string | null;
};

type ConfirmResp = {
  status: string;
  bootstrap_required: boolean;
  relogin_required: boolean;
  message?: string | null;
};

type Phase = "form" | "totp";

export default function BootstrapPage() {
  const router = useRouter();
  const { token, logout } = useAuth();

  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bootstrapOut, setBootstrapOut] = useState<BootstrapResp | null>(null);

  const [newUsername, setNewUsername] = useState("abakus");
  const [email, setEmail] = useState("");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");

  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  const passOk = useMemo(() => {
    return pass1.length >= 8 && pass1 === pass2;
  }, [pass1, pass2]);

  async function submitPhaseA() {
    setError(null);
    setBusy(true);
    try {
      const out = await apiFetch<BootstrapResp>("/identity/bootstrap/prepare", {
        method: "POST",
        token,
        body: {
          new_username: newUsername,
          email,
          new_password: pass1,
          new_password_repeat: pass2,
        },
      });
      setBootstrapOut(out);
      setPhase("totp");
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd bootstrap");
    } finally {
      setBusy(false);
    }
  }

  async function submitPhaseB() {
    if (!bootstrapOut) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch<ConfirmResp>("/identity/bootstrap/totp/confirm", {
        method: "POST",
        token,
        body: {
          totp_code: totpCode,
        },
      });

      // Bootstrap zakończony => token bootstrapowy powinien być unieważniony (token_version++)
      // więc czyścimy sesję i kierujemy do normalnego login
      logout();
      router.replace("/login");
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd potwierdzenia TOTP");
    } finally {
      setBusy(false);
    }
  }

  function copyUri() {
    if (!bootstrapOut?.totp_uri) return;
    navigator.clipboard.writeText(bootstrapOut.totp_uri).catch(() => {});
  }

  function copySecret() {
    if (!bootstrapOut?.totp_secret) return;
    navigator.clipboard.writeText(bootstrapOut.totp_secret).catch(() => {});
  }

  function backToForm() {
    setError(null);
    setPhase("form");
    setBootstrapOut(null);
    setTotpCode("");
  }

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <div className="text-sm font-semibold">Bootstrap systemu</div>
          <div className="text-xs text-muted-foreground">
            Najpierw ustawiasz dane admina (username, email, hasło), potem potwierdzasz TOTP i kończysz
            bootstrap.
          </div>
        </div>

        {error && <div className="rounded-md bg-destructive/10 p-3 text-xs">{error}</div>}

        {phase === "form" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Nowy username admina</label>
              <input
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Email admina (unikalny)</label>
              <input
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@twojadomena.pl"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Nowe hasło</label>
              <input
                type="password"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={pass1}
                onChange={(e) => setPass1(e.target.value)}
                placeholder="Minimum 8 znaków"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Powtórz hasło</label>
              <input
                type="password"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                placeholder="Powtórz dokładnie to samo"
                autoComplete="new-password"
              />
              {pass2.length > 0 && pass1 !== pass2 && (
                <div className="mt-1 text-[11px] text-destructive">Hasła nie są identyczne.</div>
              )}
            </div>

            <button
              onClick={submitPhaseA}
              disabled={busy || newUsername.length < 1 || email.length < 3 || !passOk}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Generuję QR..." : "Dalej: pokaż QR TOTP"}
            </button>
          </div>
        )}

        {phase === "totp" && bootstrapOut && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Zeskanuj QR w aplikacji TOTP (Google Authenticator / Aegis), a potem wpisz{" "}
              <span className="font-semibold">aktualny kod</span>.
            </div>

            <div className="flex justify-center rounded-lg border border-border bg-background p-4">
              <div className="rounded-md bg-white p-4">
                <QRCodeCanvas value={bootstrapOut.totp_uri} size={280} includeMargin={true} level="M" />
              </div>
            </div>

            <div className="rounded-md border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground mb-1">TOTP secret (tryb ręczny)</div>
              <div className="font-mono text-sm break-all">{bootstrapOut.totp_secret}</div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={copySecret}
                  className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted/60"
                >
                  Kopiuj secret
                </button>
                <button
                  onClick={copyUri}
                  className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted/60"
                >
                  Kopiuj URI
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Kod TOTP</label>
              <input
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="np. 123456"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>

            <button
              onClick={submitPhaseB}
              disabled={busy || totpCode.trim().length < 4}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Potwierdzam..." : "Potwierdź TOTP i zakończ bootstrap"}
            </button>

            <button
              onClick={backToForm}
              disabled={busy}
              className="w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              Wróć i popraw dane
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
