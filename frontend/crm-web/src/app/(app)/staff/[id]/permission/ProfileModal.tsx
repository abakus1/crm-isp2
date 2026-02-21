"use client";

import { SimpleModal } from "@/components/SimpleModal";
import { PrgAddressFinder } from "@/components/PrgAddressFinder";

import { formatPrgAddress, pickToPrg } from "./addressUtils";
import type { StaffAddressPrg } from "./types";
import { TabButton } from "./ui";

export function ProfileModal({
  open,
  onClose,
  saving,
  profileTab,
  setProfileTab,
  // basic
  pFirst,
  setPFirst,
  pLast,
  setPLast,
  pEmail,
  setPEmail,
  pPhone,
  setPPhone,
  pTitle,
  setPTitle,
  pBirth,
  setPBirth,
  pPesel,
  setPPesel,
  pDoc,
  setPDoc,
  pMfaReq,
  setPMfaReq,
  // legacy
  pAddrReg,
  setPAddrReg,
  pAddrCur,
  setPAddrCur,
  regLegacyAuto,
  setRegLegacyAuto,
  curLegacyAuto,
  setCurLegacyAuto,
  // prg
  pAddrRegPrg,
  setPAddrRegPrg,
  pAddrCurPrg,
  setPAddrCurPrg,
  pAddrSame,
  setPAddrSame,
  updateRegPrg,
  updateCurPrg,
  // actions
  saveProfile,
}: {
  open: boolean;
  onClose: () => void;
  saving: boolean;
  profileTab: "basic" | "reg" | "cur";
  setProfileTab: (v: "basic" | "reg" | "cur") => void;

  pFirst: string;
  setPFirst: (v: string) => void;
  pLast: string;
  setPLast: (v: string) => void;
  pEmail: string;
  setPEmail: (v: string) => void;
  pPhone: string;
  setPPhone: (v: string) => void;
  pTitle: string;
  setPTitle: (v: string) => void;
  pBirth: string;
  setPBirth: (v: string) => void;
  pPesel: string;
  setPPesel: (v: string) => void;
  pDoc: string;
  setPDoc: (v: string) => void;
  pMfaReq: boolean;
  setPMfaReq: (v: boolean) => void;

  pAddrReg: string;
  setPAddrReg: (v: string) => void;
  pAddrCur: string;
  setPAddrCur: (v: string) => void;
  regLegacyAuto: boolean;
  setRegLegacyAuto: (v: boolean) => void;
  curLegacyAuto: boolean;
  setCurLegacyAuto: (v: boolean) => void;

  pAddrRegPrg: StaffAddressPrg | null;
  setPAddrRegPrg: (v: StaffAddressPrg | null) => void;
  pAddrCurPrg: StaffAddressPrg | null;
  setPAddrCurPrg: (v: StaffAddressPrg | null) => void;
  pAddrSame: boolean;
  setPAddrSame: (v: boolean) => void;
  updateRegPrg: (patch: Partial<StaffAddressPrg>) => void;
  updateCurPrg: (patch: Partial<StaffAddressPrg>) => void;

  saveProfile: () => Promise<void>;
}) {
  return (
    <SimpleModal
      open={open}
      title="Edytuj profil pracownika"
      className="w-[min(60vw,1100px)] h-[min(60vh,820px)] max-w-none"
      bodyClassName="p-0"
      headerExtra={
        <div className="flex flex-wrap gap-2">
          <TabButton active={profileTab === "basic"} onClick={() => setProfileTab("basic")}>
            Dane podstawowe
          </TabButton>
          <TabButton active={profileTab === "reg"} onClick={() => setProfileTab("reg")}>
            Adres zameldowania
          </TabButton>
          <TabButton active={profileTab === "cur"} onClick={() => setProfileTab("cur")}>
            Adres zamieszkania
          </TabButton>
        </div>
      }
      onClose={() => {
        if (saving) return;
        onClose();
      }}
    >
      <div className="flex h-full flex-col bg-background">
        <div className="flex-1 overflow-y-auto p-4">
          {profileTab === "basic" ? (
            <div className="space-y-5">
              <div className="text-xs font-semibold">Dane podstawowe</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-xs text-muted-foreground">Imię</div>
                  <input
                    value={pFirst}
                    onChange={(e) => setPFirst(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-xs text-muted-foreground">Nazwisko</div>
                  <input
                    value={pLast}
                    onChange={(e) => setPLast(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs text-muted-foreground">Email</div>
                  <input
                    value={pEmail}
                    onChange={(e) => setPEmail(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-muted-foreground">Telefon firmowy</div>
                  <input
                    value={pPhone}
                    onChange={(e) => setPPhone(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-xs text-muted-foreground">Stanowisko</div>
                  <input
                    value={pTitle}
                    onChange={(e) => setPTitle(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  />
                </label>
              </div>

              <div className="text-xs font-semibold">Dokumenty</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-xs text-muted-foreground">Data urodzenia (YYYY-MM-DD)</div>
                  <input
                    value={pBirth}
                    onChange={(e) => setPBirth(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-xs text-muted-foreground">PESEL</div>
                  <input
                    value={pPesel}
                    onChange={(e) => setPPesel(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs text-muted-foreground">Dowód (seria/nr)</div>
                  <input
                    value={pDoc}
                    onChange={(e) => setPDoc(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  />
                </label>
              </div>

              <div className="text-xs font-semibold">Bezpieczeństwo</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={pMfaReq} onChange={(e) => setPMfaReq(e.target.checked)} />
                <span>Wymagane MFA (TOTP)</span>
              </label>
            </div>
          ) : null}

          {profileTab === "reg" ? (
            <div className="space-y-4">
              <div className="text-xs font-semibold">Adres zameldowania (PRG/ADRUNI)</div>
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Wskazówka: wybór z PRG zapisze też „tekst / legacy” (jeśli go nie edytujesz ręcznie), żeby zachować zgodność wstecz.
              </div>

              <PrgAddressFinder
                title="Adres zameldowania"
                description="Wybierz lokalizację z PRG."
                disabled={saving}
                onPick={(picked) => {
                  const prg = pickToPrg(picked);
                  setPAddrRegPrg(prg);
                  setRegLegacyAuto(true);
                  setPAddrReg(formatPrgAddress(prg));

                  if (pAddrSame) {
                    setPAddrCurPrg(null);
                    setPAddrCur("");
                    setCurLegacyAuto(true);
                  }
                }}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="space-y-1">
                  <div className="text-xs text-muted-foreground">Lokal (opcjonalnie)</div>
                  <input
                    value={pAddrRegPrg?.local_no || ""}
                    onChange={(e) => updateRegPrg({ local_no: e.target.value || null })}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    placeholder="np. 12"
                    disabled={!pAddrRegPrg}
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-xs text-muted-foreground">Kod pocztowy (opcjonalnie)</div>
                  <input
                    value={pAddrRegPrg?.postal_code || ""}
                    onChange={(e) => updateRegPrg({ postal_code: e.target.value || null })}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    placeholder="np. 30-001"
                    disabled={!pAddrRegPrg}
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-xs text-muted-foreground">Miasto (poczta) (opcjonalnie)</div>
                  <input
                    value={pAddrRegPrg?.post_city || ""}
                    onChange={(e) => updateRegPrg({ post_city: e.target.value || null })}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    placeholder="np. Kraków"
                    disabled={!pAddrRegPrg}
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <div className="text-xs text-muted-foreground">Adres zameldowania (tekst / legacy)</div>
                <textarea
                  value={pAddrReg}
                  onChange={(e) => {
                    setRegLegacyAuto(false);
                    setPAddrReg(e.target.value);
                  }}
                  className="min-h-[92px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pAddrSame}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setPAddrSame(checked);
                    if (checked) {
                      setPAddrCur("");
                      setPAddrCurPrg(null);
                      setCurLegacyAuto(true);
                    }
                  }}
                />
                <span>Adres zamieszkania taki sam jak zameldowania</span>
              </label>
            </div>
          ) : null}

          {profileTab === "cur" ? (
            <div className="space-y-4">
              <div className="text-xs font-semibold">Adres zamieszkania (PRG/ADRUNI)</div>

              {pAddrSame ? (
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="text-sm">Taki sam jak adres zameldowania.</div>
                  <div className="text-xs text-muted-foreground mt-2">Możesz to zmienić w zakładce „Adres zameldowania”.</div>
                </div>
              ) : (
                <>
                  <PrgAddressFinder
                    title="Adres zamieszkania"
                    description="Wybierz lokalizację z PRG dla adresu zamieszkania."
                    disabled={saving}
                    onPick={(picked) => {
                      const prg = pickToPrg(picked);
                      setPAddrCurPrg(prg);
                      setCurLegacyAuto(true);
                      setPAddrCur(formatPrgAddress(prg));
                    }}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="space-y-1">
                      <div className="text-xs text-muted-foreground">Lokal (opcjonalnie)</div>
                      <input
                        value={pAddrCurPrg?.local_no || ""}
                        onChange={(e) => updateCurPrg({ local_no: e.target.value || null })}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                        placeholder="np. 12"
                        disabled={!pAddrCurPrg}
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-xs text-muted-foreground">Kod pocztowy (opcjonalnie)</div>
                      <input
                        value={pAddrCurPrg?.postal_code || ""}
                        onChange={(e) => updateCurPrg({ postal_code: e.target.value || null })}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                        placeholder="np. 30-001"
                        disabled={!pAddrCurPrg}
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-xs text-muted-foreground">Miasto (poczta) (opcjonalnie)</div>
                      <input
                        value={pAddrCurPrg?.post_city || ""}
                        onChange={(e) => updateCurPrg({ post_city: e.target.value || null })}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                        placeholder="np. Kraków"
                        disabled={!pAddrCurPrg}
                      />
                    </label>
                  </div>

                  <label className="space-y-1 block">
                    <div className="text-xs text-muted-foreground">Adres zamieszkania (tekst / legacy)</div>
                    <textarea
                      value={pAddrCur}
                      onChange={(e) => {
                        setCurLegacyAuto(false);
                        setPAddrCur(e.target.value);
                      }}
                      className="min-h-[92px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="border-t border-border p-4 flex items-center justify-end gap-2 bg-muted/10">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            Anuluj
          </button>
          <button
            onClick={() => saveProfile()}
            disabled={saving}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 disabled:opacity-60"
          >
            {saving ? "Zapisuję…" : "Zapisz"}
          </button>
        </div>
      </div>
    </SimpleModal>
  );
}