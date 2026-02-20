// frontend/crm-web/src/components/PrgAddressFinder.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type PlaceSuggest = {
  place_name: string;
  terc: string;
  simc: string;
  buildings_count: number;
};

type StreetSuggest = {
  street_name: string;
  ulic: string;
  buildings_count: number;
};

type BuildingRow = {
  building_no: string;
  terc: string;
  simc: string;
  ulic?: string | null;
};

export type PrgAddressPick = {
  place_name: string;
  terc: string;
  simc: string;
  street_name: string;
  ulic: string;
  building_no: string;
};

type Props = {
  disabled?: boolean;
  title?: string;
  description?: string;
  onPick?: (picked: PrgAddressPick) => void;
};

function fmt(n?: number) {
  if (n === undefined || n === null) return "—";
  return new Intl.NumberFormat("pl-PL").format(n);
}

function normBuilding(s: string) {
  return (s || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function PrgAddressFinder({
  disabled: disabledProp,
  title = "Wyszukiwarka lokalizacji (PRG/ADRUNI)",
  description = "Flow: miejscowość → ulica → budynki. Ulica wyszukuje po słowach (w dowolnym miejscu nazwy).",
  onPick,
}: Props) {
  const { token, logout } = useAuth();
  const disabled = !!disabledProp || !token;

  // --- miejscowość (wymagana)
  const [placeQ, setPlaceQ] = useState("");
  const [placeSug, setPlaceSug] = useState<PlaceSuggest[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placePicked, setPlacePicked] = useState<PlaceSuggest | null>(null);

  // --- ulica (po wyborze miasta)
  const [streetQ, setStreetQ] = useState("");
  const [streetSug, setStreetSug] = useState<StreetSuggest[]>([]);
  const [streetLoading, setStreetLoading] = useState(false);
  const [streetPicked, setStreetPicked] = useState<StreetSuggest | null>(null);

  // --- opcjonalny filtr numeru budynku
  const [buildingQ, setBuildingQ] = useState("");

  // --- budynki (pełna lista z API)
  const [buildingsAll, setBuildingsAll] = useState<BuildingRow[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(false);

  const [err, setErr] = useState<string | null>(null);

  const placeDebRef = useRef<number | null>(null);
  const streetDebRef = useRef<number | null>(null);

  async function lookupPlaces(q: string) {
    if (!token) return;
    const qq = q.trim();

    if (qq.length < 2) {
      setPlaceSug([]);
      return;
    }

    setErr(null);
    setPlaceLoading(true);
    try {
      const res = await apiFetch<PlaceSuggest[]>(
        `/prg/lookup/places?q=${encodeURIComponent(qq)}&limit=20`,
        {
          method: "GET",
          token,
          onUnauthorized: () => logout(),
        }
      );
      setPlaceSug(res || []);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd wyszukiwania miejscowości");
      setPlaceSug([]);
    } finally {
      setPlaceLoading(false);
    }
  }

  async function lookupStreets(terc: string, simc: string, q: string) {
    if (!token) return;
    const qq = q.trim();

    if (qq.length < 1) {
      setStreetSug([]);
      return;
    }

    setErr(null);
    setStreetLoading(true);
    try {
      const res = await apiFetch<StreetSuggest[]>(
        `/prg/lookup/streets?terc=${encodeURIComponent(terc)}&simc=${encodeURIComponent(
          simc
        )}&q=${encodeURIComponent(qq)}&limit=50`,
        {
          method: "GET",
          token,
          onUnauthorized: () => logout(),
        }
      );
      setStreetSug(res || []);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd wyszukiwania ulic");
      setStreetSug([]);
    } finally {
      setStreetLoading(false);
    }
  }

  async function lookupBuildings(terc: string, simc: string, ulic: string) {
    if (!token) return;

    setErr(null);
    setBuildingsLoading(true);
    try {
      const res = await apiFetch<BuildingRow[]>(
        `/prg/lookup/buildings?terc=${encodeURIComponent(terc)}&simc=${encodeURIComponent(
          simc
        )}&ulic=${encodeURIComponent(ulic)}&limit=2000`,
        {
          method: "GET",
          token,
          onUnauthorized: () => logout(),
        }
      );
      setBuildingsAll(res || []);
    } catch (e: any) {
      const ae = e as ApiError;
      setErr(ae?.message || "Błąd pobierania budynków");
      setBuildingsAll([]);
    } finally {
      setBuildingsLoading(false);
    }
  }

  // debounce: miejscowość
  useEffect(() => {
    if (disabled) return;

    if (placePicked && placePicked.place_name !== placeQ.trim()) {
      setPlacePicked(null);

      setStreetPicked(null);
      setStreetQ("");
      setStreetSug([]);

      setBuildingQ("");
      setBuildingsAll([]);
    }

    if (placeDebRef.current) window.clearTimeout(placeDebRef.current);
    placeDebRef.current = window.setTimeout(() => {
      lookupPlaces(placeQ);
    }, 250);

    return () => {
      if (placeDebRef.current) window.clearTimeout(placeDebRef.current);
      placeDebRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeQ, disabled]);

  // debounce: ulica
  useEffect(() => {
    if (disabled) return;
    if (!placePicked) return;

    if (streetPicked && streetPicked.street_name !== streetQ.trim()) {
      setStreetPicked(null);
      setBuildingQ("");
      setBuildingsAll([]);
    }

    if (streetDebRef.current) window.clearTimeout(streetDebRef.current);
    streetDebRef.current = window.setTimeout(() => {
      lookupStreets(placePicked.terc, placePicked.simc, streetQ);
    }, 200);

    return () => {
      if (streetDebRef.current) window.clearTimeout(streetDebRef.current);
      streetDebRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetQ, placePicked, disabled]);

  // filtrowanie numeru budynku (opcjonalne) – bez kolejnych requestów
  const buildings = useMemo(() => {
    const q = normBuilding(buildingQ);
    if (!q) return buildingsAll;

    return buildingsAll.filter((b) => {
      const bn = normBuilding(b.building_no);
      // “wzorzec”: zawiera substring, więc 12 pasuje do 12A, 12/3 itd.
      return bn.includes(q);
    });
  }, [buildingsAll, buildingQ]);

  const canPickStreet = !!placePicked;
  const showBuildings = !!placePicked && !!streetPicked;

  const summary = useMemo(() => {
    if (!placePicked) return null;
    return `TERC ${placePicked.terc} • SIMC ${placePicked.simc}`;
  }, [placePicked]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{description}</div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* MIEJSCOWOŚĆ */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Miejscowość (wymagana)</label>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50"
            placeholder="np. Kraków…"
            value={placeQ}
            onChange={(e) => setPlaceQ(e.target.value)}
            disabled={disabled}
          />

          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <div>
              {placePicked ? (
                <span>
                  Wybrano: <span className="font-medium text-foreground">{placePicked.place_name}</span> • {summary}
                </span>
              ) : (
                <span>Wpisz min. 2 znaki, żeby podpowiedziało miejscowości.</span>
              )}
            </div>
            <div>{placeLoading ? "szukam…" : null}</div>
          </div>

          {!placePicked && placeSug.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border border-border bg-background">
              {placeSug.map((p) => (
                <button
                  key={`${p.terc}-${p.simc}-${p.place_name}`}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
                  onClick={() => {
                    setPlacePicked(p);
                    setPlaceQ(p.place_name);
                    setPlaceSug([]);

                    setStreetPicked(null);
                    setStreetQ("");
                    setStreetSug([]);

                    setBuildingQ("");
                    setBuildingsAll([]);
                    setErr(null);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{p.place_name}</div>
                    <div className="text-xs text-muted-foreground">{fmt(p.buildings_count)} bud.</div>
                  </div>
                  <div className="text-xs text-muted-foreground">TERC {p.terc} • SIMC {p.simc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ULICA */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Ulica</label>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50"
            placeholder={canPickStreet ? "np. Jana Pawła, Długa…" : "Najpierw wybierz miejscowość"}
            value={streetQ}
            onChange={(e) => setStreetQ(e.target.value)}
            disabled={disabled || !canPickStreet}
          />

          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <div>
              {streetPicked ? (
                <span>
                  Wybrano: <span className="font-medium text-foreground">{streetPicked.street_name}</span> • ULIC{" "}
                  {streetPicked.ulic}
                </span>
              ) : (
                <span>Wpisuj — szuka po słowach w nazwie ulicy.</span>
              )}
            </div>
            <div>{streetLoading ? "szukam…" : null}</div>
          </div>

          {placePicked && !streetPicked && streetSug.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border border-border bg-background">
              {streetSug.map((s) => (
                <button
                  key={`${s.ulic}-${s.street_name}`}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
                  onClick={() => {
                    setStreetPicked(s);
                    setStreetQ(s.street_name);
                    setStreetSug([]);
                    setBuildingQ("");
                    setBuildingsAll([]);
                    setErr(null);

                    lookupBuildings(placePicked.terc, placePicked.simc, s.ulic);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{s.street_name}</div>
                    <div className="text-xs text-muted-foreground">{fmt(s.buildings_count)} bud.</div>
                  </div>
                  <div className="text-xs text-muted-foreground">ULIC {s.ulic}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* NUMER BUDYNKU (opcjonalnie) */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Numer budynku (opcjonalnie)</label>
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50"
          placeholder={showBuildings ? "np. 12, 12A, 12/3…" : "Najpierw wybierz miejscowość i ulicę"}
          value={buildingQ}
          onChange={(e) => setBuildingQ(e.target.value)}
          disabled={disabled || !showBuildings}
        />
        <div className="text-xs text-muted-foreground">
          Puste = pokaż wszystkie. Wpisane = filtruje po wzorcu (np. “12” pokaże 12, 12A, 12/3…).
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
          disabled={disabled}
          onClick={() => {
            setPlaceQ("");
            setPlaceSug([]);
            setPlacePicked(null);

            setStreetQ("");
            setStreetSug([]);
            setStreetPicked(null);

            setBuildingQ("");
            setBuildingsAll([]);
            setErr(null);
          }}
        >
          Wyczyść
        </button>

        <div className="text-xs text-muted-foreground">
          {buildingsLoading
            ? "Ładuję budynki…"
            : buildingsAll.length > 0
            ? `Budynki: ${fmt(buildings.length)} / ${fmt(buildingsAll.length)}`
            : null}
        </div>
      </div>

      {showBuildings && (
        <div className="rounded-md border border-border bg-background p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">Budynki na ulicy</div>

          {buildingsLoading ? (
            <div className="text-sm text-muted-foreground">Ładowanie…</div>
          ) : buildings.length === 0 ? (
            <div className="text-sm text-muted-foreground">Brak wyników.</div>
          ) : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Nr budynku</th>
                    <th className="py-2 pr-3">TERC</th>
                    <th className="py-2 pr-3">SIMC</th>
                    <th className="py-2 pr-3">ULIC</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {buildings.map((b, idx) => (
                    <tr key={`${b.building_no}-${idx}`} className="border-t border-border">
                      <td className="py-2 pr-3 font-medium">{b.building_no}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{b.terc}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{b.simc}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{b.ulic || "—"}</td>
                      <td className="py-2 pr-0 text-right">
                        <button
                          type="button"
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted/40"
                          onClick={() => {
                            if (!placePicked || !streetPicked) return;

                            const picked: PrgAddressPick = {
                              place_name: placePicked.place_name,
                              terc: placePicked.terc,
                              simc: placePicked.simc,
                              street_name: streetPicked.street_name,
                              ulic: streetPicked.ulic,
                              building_no: b.building_no,
                            };

                            onPick?.(picked);
                          }}
                          title="Użyj tego adresu"
                        >
                          Wybierz
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}