import { PrgAddressPick } from "@/components/PrgAddressFinder";
import type { StaffAddressPrg } from "./types";

export function formatPrgAddress(prg: StaffAddressPrg | null | undefined) {
  if (!prg) return "";

  const place = (prg.place_name || "").trim();
  const street = (prg.street_name || "").trim();
  const bno = (prg.building_no || "").trim();
  const lno = (prg.local_no || "").trim();
  const pc = (prg.postal_code || "").trim();
  const postCity = (prg.post_city || "").trim();

  const parts: string[] = [];

  const line1 = [place, street].filter(Boolean).join(", ").trim();
  if (line1) parts.push(line1);

  const line2 = [bno ? `${bno}` : null, lno ? `lok. ${lno}` : null]
    .filter(Boolean)
    .join(" ");
  if (line2) parts.push(line2);

  const line3 = [pc, postCity].filter(Boolean).join(" ").trim();
  if (line3) parts.push(line3);

  return parts.join(", ").trim();
}

export function pickToPrg(p: PrgAddressPick): StaffAddressPrg {
  return {
    place_name: p.place_name,
    terc: p.terc,
    simc: p.simc,
    street_name: p.street_name,
    ulic: p.ulic,
    building_no: p.building_no,
    local_no: null,
    postal_code: null,
    post_city: null,
  };
}