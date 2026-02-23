// frontend/crm-web/src/app/(app)/config/catalog/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";

type CatalogProduct = {
  id: number;
  code: string;
  type: string;
  name: string;
  is_active: boolean;
};

type CatalogRequirement = {
  id: number;
  primary_product_id: number;
  required_product_id: number;
  min_qty: number;
  max_qty?: number | null;
  is_hard_required: boolean;
  primary_product_code?: string | null;
  required_product_code?: string | null;
};

export default function CatalogConfigPage() {
  const { token, logout } = useAuth();
  const perms = usePermissions();

  const canRead = perms.isAdmin || perms.hasAny(["catalog.products.read", "catalog.requirements.read"]);
  const canWrite = perms.isAdmin || perms.has("catalog.requirements.write");

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [reqs, setReqs] = useState<CatalogRequirement[]>([]);

  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const addonProducts = useMemo(() => products.filter((p) => p.type === "addon"), [products]);
  const primaryProducts = useMemo(() => products.filter((p) => p.type !== "addon"), [products]);

  const [newReqProductId, setNewReqProductId] = useState<number | null>(null);
  const [newMinQty, setNewMinQty] = useState<number>(1);
  const [newMaxQty, setNewMaxQty] = useState<string>("");
  const [newHard, setNewHard] = useState<boolean>(true);

  async function loadProducts() {
    if (!token) return;
    const rows = await apiFetch<CatalogProduct[]>("/catalog/products", {
      method: "GET",
      token,
      onUnauthorized: () => logout(),
    });
    setProducts(rows);
    if (!primaryId && rows.length > 0) {
      const first = rows.find((p) => p.type !== "addon");
      if (first) setPrimaryId(first.id);
    }
  }

  async function loadReqs(pid: number) {
    if (!token) return;
    const rows = await apiFetch<CatalogRequirement[]>(`/catalog/requirements?primary_product_id=${pid}`, {
      method: "GET",
      token,
      onUnauthorized: () => logout(),
    });
    setReqs(rows);
  }

  async function refresh() {
    setErr(null);
    setInfo(null);
    try {
      await loadProducts();
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    }
  }

  useEffect(() => {
    if (!token || !canRead) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead]);

  useEffect(() => {
    if (!token || !canRead) return;
    if (!primaryId) return;
    loadReqs(primaryId).catch((e: any) => {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryId, token, canRead]);

  async function addRequirement() {
    if (!token || !primaryId || !newReqProductId) return;
    setErr(null);
    setInfo(null);
    try {
      await apiFetch<CatalogRequirement>("/catalog/requirements", {
        method: "POST",
        token,
        onUnauthorized: () => logout(),
        body: {
          primary_product_id: primaryId,
          required_product_id: newReqProductId,
          min_qty: newMinQty,
          max_qty: newMaxQty.trim() === "" ? null : Number(newMaxQty),
          is_hard_required: newHard,
        },
      });
      setInfo("Dodano wymaganie.");
      await loadReqs(primaryId);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    }
  }

  async function saveRequirement(r: CatalogRequirement) {
    if (!token) return;
    setErr(null);
    setInfo(null);
    try {
      await apiFetch<CatalogRequirement>(`/catalog/requirements/${r.id}`, {
        method: "PUT",
        token,
        onUnauthorized: () => logout(),
        body: {
          min_qty: r.min_qty,
          max_qty: r.max_qty === undefined ? null : r.max_qty,
          is_hard_required: r.is_hard_required,
        },
      });
      setInfo("Zapisano.");
      if (primaryId) await loadReqs(primaryId);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    }
  }

  async function deleteRequirement(id: number) {
    if (!token) return;
    setErr(null);
    setInfo(null);
    try {
      await apiFetch(`/catalog/requirements/${id}`, {
        method: "DELETE",
        token,
        onUnauthorized: () => logout(),
      });
      setInfo("Usunięto.");
      if (primaryId) await loadReqs(primaryId);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd");
    }
  }

  if (!perms.loaded) {
    return <div className="p-6 text-sm text-zinc-500">Ładowanie…</div>;
  }

  if (!canRead) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Katalog</h1>
        <p className="mt-2 text-sm text-zinc-600">Brak uprawnień do konfiguracji katalogu.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Katalog: wymagania addonów</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Tu ustawiasz, że np. Internet wymaga ONT, TV wymaga STB, a Public IP jest opcjonalny (min_qty=0).
        </p>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {info ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{info}</div> : null}

      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="w-full md:w-1/2">
            <label className="block text-sm font-medium">Produkt główny</label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={primaryId ?? ""}
              onChange={(e) => setPrimaryId(e.target.value ? Number(e.target.value) : null)}
            >
              {primaryProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.type.toUpperCase()} · {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50"
            onClick={() => refresh()}
          >
            Odśwież
          </button>
        </div>

        {/* Add requirement */}
        <div className="rounded-xl border bg-zinc-50 p-3">
          <div className="text-sm font-medium">Dodaj wymaganie</div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-5 gap-2">
            <div className="md:col-span-2">
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={newReqProductId ?? ""}
                onChange={(e) => setNewReqProductId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Wybierz addon…</option>
                {addonProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                type="number"
                min={0}
                value={newMinQty}
                onChange={(e) => setNewMinQty(Number(e.target.value))}
                placeholder="min_qty"
              />
            </div>
            <div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                type="number"
                min={0}
                value={newMaxQty}
                onChange={(e) => setNewMaxQty(e.target.value)}
                placeholder="max_qty (opcjonalnie)"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newHard} onChange={(e) => setNewHard(e.target.checked)} />
                Hard required
              </label>
              <button
                disabled={!canWrite || !primaryId || !newReqProductId}
                className="ml-auto rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
                onClick={() => addRequirement()}
              >
                Dodaj
              </button>
            </div>
          </div>
          {!canWrite ? (
            <div className="mt-2 text-xs text-zinc-600">Brak uprawnienia: catalog.requirements.write</div>
          ) : null}
        </div>

        {/* Requirements table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-600">
                <th className="py-2 pr-3">Addon</th>
                <th className="py-2 pr-3">min</th>
                <th className="py-2 pr-3">max</th>
                <th className="py-2 pr-3">hard</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {reqs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-zinc-500">
                    Brak wymagań dla wybranego produktu.
                  </td>
                </tr>
              ) : null}

              {reqs.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{r.required_product_code || `#${r.required_product_id}`}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="w-20 rounded-lg border px-2 py-1"
                      type="number"
                      min={0}
                      value={r.min_qty}
                      disabled={!canWrite}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setReqs((prev) => prev.map((x) => (x.id === r.id ? { ...x, min_qty: v } : x)));
                      }}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="w-24 rounded-lg border px-2 py-1"
                      type="number"
                      min={0}
                      value={r.max_qty ?? ""}
                      disabled={!canWrite}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === "" ? null : Number(raw);
                        setReqs((prev) => prev.map((x) => (x.id === r.id ? { ...x, max_qty: v } : x)));
                      }}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={r.is_hard_required}
                      disabled={!canWrite}
                      onChange={(e) => {
                        setReqs((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_hard_required: e.target.checked } : x)));
                      }}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        disabled={!canWrite}
                        className="rounded-lg border px-3 py-1 hover:bg-zinc-50 disabled:opacity-40"
                        onClick={() => saveRequirement(r)}
                      >
                        Zapisz
                      </button>
                      <button
                        disabled={!canWrite}
                        className="rounded-lg border px-3 py-1 hover:bg-zinc-50 disabled:opacity-40"
                        onClick={() => deleteRequirement(r.id)}
                      >
                        Usuń
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
