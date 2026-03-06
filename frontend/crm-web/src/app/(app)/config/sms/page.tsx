"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";

type SmeskomState = {
  enabled: boolean;
  primary_base_url: string;
  secondary_base_url: string;
  auth_mode: "basic" | "body";
  login: string;
  has_password: boolean;
  timeout_seconds: number;
  callback_enabled: boolean;
  callback_url: string;
  has_callback_secret: boolean;
  inbound_mode: "callback" | "polling";
  receive_mark_as_read: boolean;
  receive_poll_interval_seconds: number;
  provider_name: string;
  persistence_mode: "env" | "db" | "db+env-fallback" | string;
};

type TestResponse = {
  ok: boolean;
  base_url_used: string;
  auth_mode: "basic" | "body";
  http_status: number | null;
  provider_message: string;
  response_excerpt?: string | null;
};

type FormState = {
  enabled: boolean;
  primary_base_url: string;
  secondary_base_url: string;
  auth_mode: "basic" | "body";
  login: string;
  password: string;
  timeout_seconds: number;
  callback_enabled: boolean;
  callback_url: string;
  callback_secret: string;
  inbound_mode: "callback" | "polling";
  receive_mark_as_read: boolean;
  receive_poll_interval_seconds: number;
};

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {desc ? <div className="text-xs text-muted-foreground mt-1">{desc}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 block">
      <div className="text-xs font-medium">{label}</div>
      {children}
      {helper ? <div className="text-[11px] text-muted-foreground">{helper}</div> : null}
    </label>
  );
}

const DEFAULT_FORM: FormState = {
  enabled: false,
  primary_base_url: "https://api1.smeskom.pl/api/v1",
  secondary_base_url: "https://api2.smeskom.pl/api/v1",
  auth_mode: "basic",
  login: "",
  password: "",
  timeout_seconds: 10,
  callback_enabled: false,
  callback_url: "",
  callback_secret: "",
  inbound_mode: "callback",
  receive_mark_as_read: true,
  receive_poll_interval_seconds: 60,
};

export default function SmsConfigPage() {
  const { token, logout } = useAuth();
  const perms = usePermissions();

  const canRead = perms.isAdmin || perms.has("sms.config.read") || perms.has("sms.config.write");
  const canWrite = perms.isAdmin || perms.has("sms.config.write");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [serverState, setServerState] = useState<SmeskomState | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token || !canRead) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<SmeskomState>("/sms/config/smeskom/state", {
          method: "GET",
          token,
          onUnauthorized: () => logout(),
        });
        if (cancelled) return;
        setServerState(res);
        setForm({
          enabled: res.enabled,
          primary_base_url: res.primary_base_url,
          secondary_base_url: res.secondary_base_url,
          auth_mode: res.auth_mode,
          login: res.login,
          password: "",
          timeout_seconds: res.timeout_seconds,
          callback_enabled: res.callback_enabled,
          callback_url: res.callback_url,
          callback_secret: "",
          inbound_mode: res.inbound_mode,
          receive_mark_as_read: res.receive_mark_as_read,
          receive_poll_interval_seconds: res.receive_poll_interval_seconds,
        });
      } catch (e) {
        if (cancelled) return;
        const ae = e as ApiError;
        setError(ae?.message || "Nie udało się pobrać konfiguracji SMS.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token, logout, canRead]);

  const effectiveReceiveModeLabel = useMemo(() => {
    return form.inbound_mode === "callback" ? "HTTP Callback" : "Polling fallback";
  }, [form.inbound_mode]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveConfig() {
    if (!token || !canWrite) return;
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const res = await apiFetch<SmeskomState>("/sms/config/smeskom", {
        method: "PUT",
        token,
        onUnauthorized: () => logout(),
        body: {
          enabled: form.enabled,
          primary_base_url: form.primary_base_url,
          secondary_base_url: form.secondary_base_url,
          auth_mode: form.auth_mode,
          login: form.login,
          password: form.password || null,
          timeout_seconds: Number(form.timeout_seconds || 10),
          callback_enabled: form.callback_enabled,
          callback_url: form.callback_url,
          callback_secret: form.callback_secret || null,
          inbound_mode: form.inbound_mode,
          receive_mark_as_read: form.receive_mark_as_read,
          receive_poll_interval_seconds: Number(form.receive_poll_interval_seconds || 60),
        },
      });

      setServerState(res);
      setForm((prev) => ({ ...prev, password: "", callback_secret: "" }));
      setInfo("Konfiguracja SMeSKom została zapisana do bazy. Terminal może iść na krótkie L4.");
    } catch (e) {
      const ae = e as ApiError;
      setError(ae?.message || "Nie udało się zapisać konfiguracji SMS.");
    } finally {
      setBusy(false);
    }
  }

  async function runConnectionTest() {
    if (!token || !canWrite) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    setTestResult(null);

    try {
      const res = await apiFetch<TestResponse>("/sms/config/smeskom/test-connection", {
        method: "POST",
        token,
        onUnauthorized: () => logout(),
        body: {
          primary_base_url: form.primary_base_url,
          secondary_base_url: form.secondary_base_url,
          auth_mode: form.auth_mode,
          login: form.login,
          password: form.password,
          timeout_seconds: Number(form.timeout_seconds || 10),
        },
      });
      setTestResult(res);
      setInfo(res.ok ? "Połączenie wygląda zdrowo. Kosmiczny gołąb z API nie spanikował." : null);
    } catch (e) {
      const ae = e as ApiError;
      setError(ae?.message || "Test połączenia nie powiódł się.");
    } finally {
      setBusy(false);
    }
  }

  if (!perms.loaded) {
    return <div className="p-6 text-sm text-muted-foreground">Ładowanie uprawnień…</div>;
  }

  if (!canRead) {
    return (
      <div className="p-6">
        <div className="rounded-xl border bg-card p-4 text-sm">Brak dostępu do konfiguracji SMS.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold">Konfiguracja → SMS → SMeSKom</div>
          <div className="text-xs text-muted-foreground mt-1 max-w-3xl">
            Pierwsza sensowna wersja integracji: UI + backend adapter + zapis konfiguracji do DB + webhook callback.
            Panel pokazuje teraz stan efektywny, pozwala testować połączenie na żywo i zapisywać ustawienia bez klepania ENV jak mnich w terminalu.
          </div>
        </div>
        <div className="rounded-lg border px-3 py-2 text-xs bg-muted/30">
          Tryb konfiguracji: <span className="font-semibold">{serverState?.persistence_mode ?? "env"}</span>
        </div>
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Ładowanie konfiguracji…</div> : null}
      {error ? <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {info ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">{info}</div> : null}

      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-4">
        <div className="space-y-4">
          <Section
            title="Połączenie REST"
            desc="Oficjalne endpointy SMeSKom do wysyłki/statusów. W testach lecimy po sms/status jako szybkim health-checku integracji."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Integracja aktywna">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => update("enabled", e.target.checked)}
                  />
                  Włącz SMeSKom
                </label>
              </Field>

              <Field label="Tryb autoryzacji">
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.auth_mode}
                  onChange={(e) => update("auth_mode", e.target.value as FormState["auth_mode"])}
                >
                  <option value="basic">HTTP Basic Auth</option>
                  <option value="body">login/password w payloadzie</option>
                </select>
              </Field>

              <Field label="Primary API URL">
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.primary_base_url}
                  onChange={(e) => update("primary_base_url", e.target.value)}
                  placeholder="https://api1.smeskom.pl/api/v1"
                />
              </Field>

              <Field label="Secondary API URL" helper="Fallback na drugą bramkę, gdy primary robi teatralne wyjście awaryjne.">
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.secondary_base_url}
                  onChange={(e) => update("secondary_base_url", e.target.value)}
                  placeholder="https://api2.smeskom.pl/api/v1"
                />
              </Field>

              <Field label="Login API">
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.login}
                  onChange={(e) => update("login", e.target.value)}
                  placeholder="np. htguser9999"
                />
              </Field>

              <Field
                label="Hasło API"
                helper={serverState?.has_password ? "Hasło jest już zapisane po stronie backendu. Żeby przetestować aktualny formularz, wpisz je tutaj ręcznie." : undefined}
              >
                <input
                  type="password"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="••••••••"
                />
              </Field>

              <Field label="Timeout (sekundy)">
                <input
                  type="number"
                  min={1}
                  max={60}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.timeout_seconds}
                  onChange={(e) => update("timeout_seconds", Number(e.target.value || 10))}
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveConfig}
                disabled={busy || !canWrite || !form.login}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
              >
                {busy ? "Praca w toku…" : "Zapisz konfigurację"}
              </button>
              <button
                type="button"
                onClick={runConnectionTest}
                disabled={busy || !canWrite || !form.login || !form.password}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
              >
                {busy ? "Praca w toku…" : "Test połączenia"}
              </button>
              <div className="rounded-md border px-3 py-2 text-xs bg-muted/20">
                Aktualny effective host: <span className="font-medium">{serverState?.primary_base_url ?? DEFAULT_FORM.primary_base_url}</span>
              </div>
            </div>
          </Section>

          <Section
            title="Inbound / callback"
            desc="Docelowy model: REST do outboundu, HTTP Callback do zdarzeń zwrotnych i SMS-ów przychodzących. Polling zostawiamy jako fallback, bo czasem rzeczywistość lubi się potknąć o kabel."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Callback aktywny">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.callback_enabled}
                    onChange={(e) => update("callback_enabled", e.target.checked)}
                  />
                  Obsługuj webhook SMeSKom
                </label>
              </Field>

              <Field label="Tryb odbioru">
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.inbound_mode}
                  onChange={(e) => update("inbound_mode", e.target.value as FormState["inbound_mode"])}
                >
                  <option value="callback">HTTP Callback</option>
                  <option value="polling">Polling fallback</option>
                </select>
              </Field>

              <Field label="URL callbacka CRM">
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.callback_url}
                  onChange={(e) => update("callback_url", e.target.value)}
                  placeholder="https://crm.example.pl/hooks/sms/smeskom"
                />
              </Field>

              <Field label="Sekret callbacka" helper={serverState?.has_callback_secret ? "Sekret callbacka jest już zapisany po stronie backendu." : undefined}>
                <input
                  type="password"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.callback_secret}
                  onChange={(e) => update("callback_secret", e.target.value)}
                  placeholder="shared-secret"
                />
              </Field>

              <Field label="Mark as read przy receive">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.receive_mark_as_read}
                    onChange={(e) => update("receive_mark_as_read", e.target.checked)}
                  />
                  Oznaczaj SMS jako przeczytany
                </label>
              </Field>

              <Field label="Interwał polling fallback (sekundy)">
                <input
                  type="number"
                  min={5}
                  max={3600}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.receive_poll_interval_seconds}
                  onChange={(e) => update("receive_poll_interval_seconds", Number(e.target.value || 60))}
                />
              </Field>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Stan efektywny" desc="To, co backend aktualnie widzi po złożeniu DB + fallbacków z ENV, gdy czegoś nie zapisano w DB.">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3"><span>Provider</span><span className="font-medium">{serverState?.provider_name ?? "SMeSKom"}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Integracja</span><span className="font-medium">{form.enabled ? "aktywna" : "wyłączona"}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Auth</span><span className="font-medium">{form.auth_mode}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Inbound</span><span className="font-medium">{effectiveReceiveModeLabel}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Hasło dostępne</span><span className="font-medium">{serverState?.has_password ? "tak" : "nie"}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Sekret callbacka dostępny</span><span className="font-medium">{serverState?.has_callback_secret ? "tak" : "nie"}</span></div>
            </div>
          </Section>

          <Section title="Wynik testu" desc="Test backendowy idzie przez adapter SMeSKom i próbuje sprawdzić połączenie na oficjalnym REST API.">
            {testResult ? (
              <div className="space-y-3 text-sm">
                <div className={`rounded-lg border p-3 ${testResult.ok ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                  <div className="font-medium">{testResult.provider_message}</div>
                  <div className="text-xs mt-1">Host: {testResult.base_url_used}</div>
                  <div className="text-xs">HTTP status: {testResult.http_status ?? "—"}</div>
                  <div className="text-xs">Auth: {testResult.auth_mode}</div>
                </div>
                {testResult.response_excerpt ? (
                  <div className="rounded-lg border bg-muted/20 p-3 text-xs break-words">
                    <div className="font-medium mb-1">Fragment odpowiedzi</div>
                    <div>{testResult.response_excerpt}</div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Brak wyniku. Uruchom test połączenia po wpisaniu loginu i hasła.</div>
            )}
          </Section>

          <Section title="Co już jest, a czego jeszcze nie ma">
            <ul className="list-disc ml-5 text-sm text-muted-foreground space-y-1">
              <li>Jest adapter backendowy do SMeSKom i endpoint testu połączenia.</li>
              <li>Jest ekran konfiguracji w panelu admina.</li>
              <li>Jest zapis konfiguracji do DB z fallbackiem do ENV dla sekretów, jeśli trzeba.</li>
              <li>Jest webhook callback, który przyjmuje request i zapisuje surowe zdarzenie do DB.</li>
              <li>Nie ma jeszcze kolejki outbound/inbound SMS ani właściwego procesora zdarzeń.</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
