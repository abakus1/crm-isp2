"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";

import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type SetupPasswordResp = { status: string; relogin_required: boolean };
type TotpBeginResp = { totp_secret: string; totp_uri: string };
type TotpConfirmResp = { status: string; relogin_required: boolean };

export default function SetupPage() {
  const router = useRouter();
  const { token, logout } = useAuth();

  const [step, setStep] = useState<"password" | "totp" | "done">("password");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  const [totpCode, setTotpCode] = useState("");
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);

  function handleUnauthorized() {
    logout();
    router.replace("/login");
  }

  const pwMinOk = useMemo(() => pw1.trim().length >= 8, [pw1]);
  const pwMatchOk = useMemo(() => pw1 === pw2, [pw1, pw2]);
  const canSubmitPassword = useMemo(() => pwMinOk && pwMatchOk, [pwMinOk, pwMatchOk]);
  const canSubmitTotp = useMemo(() => /^\d{6}$/.test(totpCode.trim()), [totpCode]);

  async function beginTotp() {
    setError(null);
    setOk(null);

    const resp = await apiFetch<TotpBeginResp>("/identity/setup/totp/begin", {
      method: "POST",
      token,
      onUnauthorized: handleUnauthorized,
    });

    setTotpSecret(resp.totp_secret);
    setTotpUri(resp.totp_uri);
  }

  async function setupPassword() {
    setError(null);
    setOk(null);
    setBusy(true);

    try {
      // ✅ zgodnie z backendem: new_password + new_password_repeat
      const resp = await apiFetch<SetupPasswordResp>("/identity/setup/password", {
        method: "POST",
        token,
        onUnauthorized: handleUnauthorized,
        body: {
          new_password: pw1,
          new_password_repeat: pw2,
        },
      });

      if (resp.relogin_required) {
        setOk("Hasło ustawione. Zaloguj się ponownie.");
        logout();
        router.replace("/login");
        return;
      }

      setOk("Hasło ustawione. Konfigurujemy TOTP…");
      setStep("totp");
      await beginTotp();
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Nie udało się ustawić hasła");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp() {
    setError(null);
    setOk(null);
    setBusy(true);

    try {
      if (!totpSecret) {
        setError("Brak sekretu TOTP. Kliknij „Odśwież QR”.");
        return;
      }

      // ✅ zgodnie z backendem: totp_code + totp_secret
      const resp = await apiFetch<TotpConfirmResp>("/identity/setup/totp", {
        method: "POST",
        token,
        onUnauthorized: handleUnauthorized,
        body: {
          totp_code: totpCode.trim(),
          totp_secret: totpSecret,
        },
      });

      if (resp.relogin_required) {
        setOk("TOTP skonfigurowane. Zaloguj się ponownie.");
        logout();
        router.replace("/login");
        return;
      }

      setOk("TOTP skonfigurowane. Gotowe ✅");
      setStep("done");
      setTimeout(() => router.replace("/"), 600);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Niepoprawny kod TOTP");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token) router.replace("/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-sm font-semibold">Pierwsze uruchomienie</div>
        <div className="text-xs text-muted-foreground">
          Ustaw hasło i skonfiguruj TOTP. Potem wchodzisz normalnie do panelu.
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-xs">{error}</div>}
      {ok && <div className="rounded-md bg-emerald-500/10 p-3 text-xs">{ok}</div>}

      {step === "password" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="text-sm font-medium">Ustaw nowe hasło</div>

          <div className="space-y-2">
            <input
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              placeholder="Nowe hasło (min. 8 znaków)"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Powtórz nowe hasło"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          {!pwMinOk && pw1.length > 0 && (
            <div className="text-[11px] text-muted-foreground">Hasło jest za krótkie.</div>
          )}
          {pw1.length > 0 && pw2.length > 0 && !pwMatchOk && (
            <div className="text-[11px] text-destructive">Hasła nie są identyczne.</div>
          )}

          <button
            disabled={busy || !canSubmitPassword}
            onClick={setupPassword}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            {busy ? "Zapisuję..." : "Zapisz hasło"}
          </button>

          <div className="text-[11px] text-muted-foreground">
            Dwa pola = mniej literówek, mniej płaczu, więcej spokoju.
          </div>
        </div>
      )}

      {step === "totp" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <div className="text-sm font-medium">Konfiguracja TOTP</div>
            <div className="text-xs text-muted-foreground">
              Zeskanuj QR w Google Authenticator / Authy / 1Password.
            </div>
          </div>

          {totpUri ? (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg border border-border bg-background p-3">
                <QRCodeCanvas value={totpUri} size={220} />
              </div>

              {totpSecret && (
                <div className="text-xs text-muted-foreground">
                  Klucz ręczny: <span className="font-mono text-foreground">{totpSecret}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Brak QR. Kliknij „Odśwież QR”.
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              inputMode="numeric"
              placeholder="Kod 6-cyfrowy"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              disabled={busy || !canSubmitTotp}
              onClick={confirmTotp}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              {busy ? "Sprawdzam..." : "Zatwierdź"}
            </button>
          </div>

          <button
            disabled={busy}
            onClick={beginTotp}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            Odśwież QR
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-2">
          <div className="text-sm font-medium">Gotowe ✅</div>
          <div className="text-xs text-muted-foreground">Przekierowuję na dashboard…</div>
        </div>
      )}
    </div>
  );
}