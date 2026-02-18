"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";

import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SimpleModal } from "@/components/SimpleModal";

type WhoAmI = {
  staff_id: number;
  username: string;
  email: string | null;
  role: string;
  bootstrap_mode: boolean;
  setup_mode: boolean;
};

type UpdateEmailResp = { status: string; email: string };
type ChangePasswordResp = { status: string };

type TotpResetBeginResp = {
  status: string;
  totp_secret: string;
  totp_uri: string;
};

type TotpResetConfirmResp = { status: string };

export default function SettingsPage() {
  const router = useRouter();
  const { token, logout } = useAuth();

  const [me, setMe] = useState<WhoAmI | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // --- modale ---
  const [openPwd, setOpenPwd] = useState(false);
  const [openEmail, setOpenEmail] = useState(false);
  const [openTotp, setOpenTotp] = useState(false);

  // password change
  const [curPwd1, setCurPwd1] = useState("");
  const [newPwd1, setNewPwd1] = useState("");
  const [newPwd2, setNewPwd2] = useState("");

  // email change
  const [newEmail, setNewEmail] = useState("");
  const [curPwd2, setCurPwd2] = useState("");
  const [totpCode2, setTotpCode2] = useState("");

  // totp reset (2-fazowo)
  const [totpStep, setTotpStep] = useState<"auth" | "confirm">("auth");
  const [curPwd3, setCurPwd3] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpCode3, setTotpCode3] = useState("");

  function handleUnauthorized() {
    logout();
    router.replace("/login");
  }

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }

    (async () => {
      try {
        const who = await apiFetch<WhoAmI>("/identity/whoami", {
          method: "GET",
          token,
          onUnauthorized: handleUnauthorized,
        });
        setMe(who);
        setNewEmail(who.email || "");
      } catch (e: any) {
        const err = e as ApiError;
        setError(err.message || "Nie mogę pobrać profilu");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ✅ Zmieniamy: blokujemy tylko bootstrap_mode.
  // setup_mode NIE chowa self-service (bo admin chce móc zmienić hasło/TOTP normalnie).
  const canOpen = useMemo(() => {
    if (!me) return false;
    if (me.bootstrap_mode) return false;
    return true;
  }, [me]);

  async function changePassword() {
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      await apiFetch<ChangePasswordResp>("/identity/me/password", {
        method: "POST",
        token,
        body: {
          current_password: curPwd1,
          new_password1: newPwd1,
          new_password2: newPwd2,
        },
        onUnauthorized: handleUnauthorized,
      });

      setOk("Hasło zmienione. Zaloguj się ponownie ✅");
      setOpenPwd(false);
      setCurPwd1("");
      setNewPwd1("");
      setNewPwd2("");

      // backend robi token_version++ → relogin
      handleUnauthorized();
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd zmiany hasła");
    } finally {
      setBusy(false);
    }
  }

  async function saveEmail() {
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      const out = await apiFetch<UpdateEmailResp>("/identity/me/email", {
        method: "PUT",
        token,
        body: {
          new_email: newEmail,
          current_password: curPwd2,
          totp_code: totpCode2,
        },
        onUnauthorized: handleUnauthorized,
      });

      setOk("Email zaktualizowany. Zaloguj się ponownie ✅");
      setMe((prev) => (prev ? { ...prev, email: out.email } : prev));
      setOpenEmail(false);
      setCurPwd2("");
      setTotpCode2("");

      handleUnauthorized();
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Błąd zmiany email");
    } finally {
      setBusy(false);
    }
  }

  async function totpResetBegin() {
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      const out = await apiFetch<TotpResetBeginResp>("/identity/me/totp/reset", {
        method: "POST",
        token,
        body: { current_password: curPwd3 },
        onUnauthorized: handleUnauthorized,
      });

      setTotpSecret(out.totp_secret);
      setTotpUri(out.totp_uri);
      setTotpStep("confirm");
      setTotpCode3("");
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Nie udało się rozpocząć resetu TOTP");
    } finally {
      setBusy(false);
    }
  }

  async function totpResetConfirm() {
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      await apiFetch<TotpResetConfirmResp>("/identity/me/totp/reset/confirm", {
        method: "POST",
        token,
        body: { totp_code: totpCode3, totp_secret: totpSecret },
        onUnauthorized: handleUnauthorized,
      });

      setOk("TOTP zmienione. Zaloguj się ponownie ✅");
      setOpenTotp(false);
      setTotpStep("auth");
      setCurPwd3("");
      setTotpUri(null);
      setTotpSecret(null);
      setTotpCode3("");

      handleUnauthorized();
    } catch (e: any) {
      const err = e as ApiError;
      setError(err.message || "Nie udało się potwierdzić nowego TOTP");
    } finally {
      setBusy(false);
    }
  }

  function closePwd() {
    if (busy) return;
    setOpenPwd(false);
    setCurPwd1("");
    setNewPwd1("");
    setNewPwd2("");
  }

  function closeEmail() {
    if (busy) return;
    setOpenEmail(false);
    setCurPwd2("");
    setTotpCode2("");
    setNewEmail(me?.email || "");
  }

  function closeTotp() {
    if (busy) return;
    setOpenTotp(false);
    setTotpStep("auth");
    setCurPwd3("");
    setTotpUri(null);
    setTotpSecret(null);
    setTotpCode3("");
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Ustawienia</div>
        <div className="text-xs text-muted-foreground">Profil użytkownika i bezpieczeństwo.</div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-xs">{error}</div>}
      {ok && <div className="rounded-md bg-primary/10 p-3 text-xs">{ok}</div>}

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="text-xs text-muted-foreground">Twoje konto</div>

        <div className="text-sm">
          <span className="text-muted-foreground">Username:</span>{" "}
          <span className="font-mono">{me?.username ?? "…"}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Rola:</span>{" "}
          <span className="font-mono">{me?.role ?? "…"}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Email:</span>{" "}
          <span className="font-mono">{me?.email ?? "—"}</span>
        </div>

        {!canOpen ? (
          <div className="rounded-md bg-muted/40 p-3 text-xs">
            Te operacje są niedostępne w trybie <span className="font-semibold">bootstrap</span>.
            Zaloguj się normalnie na konto admina (nie admin/admin).
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              onClick={() => setOpenPwd(true)}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
            >
              Zmień hasło
            </button>

            <button
              onClick={() => {
                setTotpStep("auth");
                setOpenTotp(true);
              }}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
            >
              Zmień TOTP
            </button>

            <button
              onClick={() => setOpenEmail(true)}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
            >
              Zmień email
            </button>
          </div>
        )}
      </div>

      {/* Modal: zmiana hasła */}
      <SimpleModal
        open={openPwd}
        title="Zmień hasło"
        description="Podaj stare hasło i ustaw nowe. Po zmianie nastąpi wylogowanie (token_version)."
        onClose={closePwd}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={closePwd}
              disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              Anuluj
            </button>
            <button
              onClick={changePassword}
              disabled={
                busy ||
                curPwd1.length < 3 ||
                newPwd1.length < 8 ||
                newPwd2.length < 8 ||
                newPwd1 !== newPwd2
              }
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              {busy ? "Zapisuję..." : "Zmień hasło"}
            </button>
          </div>
        }
      >
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Aktualne hasło</div>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={curPwd1}
            onChange={(e) => setCurPwd1(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Nowe hasło</div>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={newPwd1}
            onChange={(e) => setNewPwd1(e.target.value)}
            type="password"
            autoComplete="new-password"
          />
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Powtórz nowe hasło</div>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={newPwd2}
            onChange={(e) => setNewPwd2(e.target.value)}
            type="password"
            autoComplete="new-password"
          />
          {newPwd1 && newPwd2 && newPwd1 !== newPwd2 ? (
            <div className="text-[11px] text-destructive">Hasła nie są takie same.</div>
          ) : null}
        </div>
      </SimpleModal>

      {/* Modal: zmiana email */}
      <SimpleModal
        open={openEmail}
        title="Zmień email"
        description="Wymagamy hasła i TOTP. Po zmianie nastąpi wylogowanie."
        onClose={closeEmail}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={closeEmail}
              disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              Anuluj
            </button>
            <button
              onClick={saveEmail}
              disabled={busy || newEmail.length < 3 || curPwd2.length < 3 || totpCode2.length < 6}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              {busy ? "Zapisuję..." : "Zmień email"}
            </button>
          </div>
        }
      >
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Nowy email</div>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="ty@domena.pl"
            autoComplete="email"
          />
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Aktualne hasło</div>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={curPwd2}
            onChange={(e) => setCurPwd2(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Kod TOTP</div>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={totpCode2}
            onChange={(e) => setTotpCode2(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
          />
        </div>
      </SimpleModal>

      {/* Modal: zmiana TOTP (2 fazy) */}
      <SimpleModal
        open={openTotp}
        title="Zmień TOTP"
        description={
          totpStep === "auth"
            ? "Krok 1/2: potwierdź hasłem."
            : "Krok 2/2: zeskanuj QR i potwierdź kodem."
        }
        onClose={closeTotp}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={closeTotp}
              disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
            >
              Anuluj
            </button>

            {totpStep === "auth" ? (
              <button
                onClick={totpResetBegin}
                disabled={busy || curPwd3.length < 3}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
              >
                {busy ? "Sprawdzam..." : "Dalej"}
              </button>
            ) : (
              <button
                onClick={totpResetConfirm}
                disabled={busy || totpCode3.length < 6}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
              >
                {busy ? "Zapisuję..." : "Potwierdź nowy TOTP"}
              </button>
            )}
          </div>
        }
      >
        {totpStep === "auth" ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Aktualne hasło</div>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={curPwd3}
              onChange={(e) => setCurPwd3(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              <div className="rounded-lg border border-border p-3 flex items-center justify-center bg-white">
                {totpUri ? (
                  <div className="bg-white p-2 rounded">
                    <QRCodeCanvas
                      value={totpUri}
                      size={256}
                      bgColor="#ffffff"
                      fgColor="#000000"
                      level="M"
                      includeMargin={true}
                    />
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Brak QR</div>
                )}
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Sekret (backup)</div>
                <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs break-all">
                  {totpSecret || "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Zeskanuj QR w Authenticator i wpisz kod.
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Kod TOTP</div>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={totpCode3}
                onChange={(e) => setTotpCode3(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
              />
            </div>
          </div>
        )}
      </SimpleModal>
    </div>
  );
}
