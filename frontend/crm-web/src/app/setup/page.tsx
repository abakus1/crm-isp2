"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import QRCode from "qrcode.react";

type SetupPasswordResp = { status: string; relogin_required: boolean };
type TotpBeginResp = { totp_secret: string; totp_uri: string };
type TotpConfirmResp = { status: string; relogin_required: boolean };

export default function SetupPage() {
  const { token, logout } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"password" | "totp" | "done">("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

  const [totp, setTotp] = useState<TotpBeginResp | null>(null);
  const [totpCode, setTotpCode] = useState("");

  // Jeśli nie ma tokena -> login
  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  async function submitPassword() {
    setError(null);
    setBusy(true);
    try {
      const out = await apiFetch<SetupPasswordResp>("/identity/setup/password", {
        method: "POST",
        token,
        body: { new_password: newPassword, new_password_repeat: newPassword2 },
        onUnauthorized: () => {
          logout();
          router.replace("/login");
        },
      });

      // po zmianie hasła przechodzimy do TOTP (bez reloginu)
      setStep("totp");

      // Start TOTP begin (backend generuje secret + URI)
      const begin = await apiFetch<TotpBeginResp>("/identity/setup/totp/begin", {
        method: "POST",
        token,
        body: {},
        onUnauthorized: () => {
          logout();
          router.replace("/login");
        },
      });
      setTotp(begin);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd setup password");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp() {
    if (!totp) return;
    setError(null);
    setBusy(true);
    try {
      const out = await apiFetch<TotpConfirmResp>("/identity/setup/totp/confirm", {
        method: "POST",
        token,
        body: { totp_secret: totp.totp_secret, totp_code: totpCode },
        onUnauthorized: () => {
          logout();
          router.replace("/login");
        },
      });

      // Backend mówi: relogin required -> robimy czyste wylogowanie
      setStep("done");
      logout();
      router.replace("/login");
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd confirm TOTP");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <div className="text-sm font-semibold">Pierwsze logowanie</div>
          <div className="text-xs text-muted-foreground">
            Ustaw nowe hasło i skonfiguruj TOTP. Bez tego nie wejdziesz do panelu.
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-xs">
            {error}
          </div>
        )}

        {step === "password" && (
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">Nowe hasło</label>
            <input
              type="password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 znaków"
            />

            <label className="block text-xs text-muted-foreground">Powtórz nowe hasło</label>
            <input
              type="password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              placeholder="Powtórz hasło"
            />

            <button
              onClick={submitPassword}
              disabled={busy || newPassword.length < 8 || newPassword2.length < 8}
              className="w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              {busy ? "Zapisuję..." : "Zapisz hasło"}
            </button>
          </div>
        )}

        {step === "totp" && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Zeskanuj QR w aplikacji (Google Authenticator / Authy / 1Password), potem wpisz kod.
            </div>

            <div className="flex justify-center rounded-lg border border-border bg-background p-4">
              {totp ? <QRCode value={totp.totp_uri} size={180} /> : <div className="text-xs">Ładuję QR...</div>}
            </div>

            <label className="block text-xs text-muted-foreground">Kod TOTP</label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="6 cyfr"
            />

            <button
              onClick={confirmTotp}
              disabled={busy || totpCode.length < 4}
              className="w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              {busy ? "Potwierdzam..." : "Potwierdź TOTP"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="text-xs text-muted-foreground">
            Setup zakończony. Zaloguj się ponownie nowym hasłem i TOTP.
          </div>
        )}
      </div>
    </div>
  );
}
