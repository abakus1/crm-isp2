// frontend/crm-web/src/lib/api.ts
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export type ApiError = {
  status: number;
  message: string;
  detail?: any;
};

type JsonBody = Record<string, any>;

export type ApiFetchOptions = Omit<RequestInit, "body"> & {
  token?: string | null;
  onUnauthorized?: () => void;
  body?: JsonBody | BodyInit | string | null;
};

function isPlainObject(value: any): value is Record<string, any> {
  if (!value) return false;
  if (typeof value !== "object") return false;
  if (value instanceof FormData) return false;
  if (value instanceof Blob) return false;
  if (value instanceof ArrayBuffer) return false;
  return true;
}

function isFormData(value: any): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  if (!BASE) {
    throw {
      status: 0,
      message: "NEXT_PUBLIC_API_BASE_URL is not set",
      detail: null,
    } as ApiError;
  }

  const url = `${BASE}${path}`;
  const headers = new Headers(opts.headers || {});

  let requestBody: any = opts.body;

  // ✅ 1) plain object → JSON.stringify + application/json
  if (isPlainObject(requestBody)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify(requestBody);
  }

  // ✅ 2) string body (np. już zrobione JSON.stringify w miejscu wywołania)
  // Ustawiamy JSON Content-Type, bo backend tego oczekuje.
  // (Nie dotykamy, jeśli ktoś celowo ustawił inaczej)
  if (typeof requestBody === "string") {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }

  // ✅ 3) FormData → NIE ustawiamy Content-Type (boundary robi przeglądarka)
  if (isFormData(requestBody)) {
    headers.delete("Content-Type");
  }

  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);

  const res = await fetch(url, { ...opts, headers, body: requestBody as any });

  if (res.status === 401) {
    opts.onUnauthorized?.();
  }

  const ct = res.headers.get("content-type") || "";
  const responseBody = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (!res.ok) {
    const msg =
      typeof responseBody === "object" && responseBody?.detail
        ? String(responseBody.detail)
        : `HTTP ${res.status}`;

    throw {
      status: res.status,
      message: msg,
      detail: responseBody,
    } as ApiError;
  }

  return responseBody as T;
}
