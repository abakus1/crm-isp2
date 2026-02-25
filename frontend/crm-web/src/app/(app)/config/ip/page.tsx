"use client";

import Link from "next/link";

function Card({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="block rounded-xl border bg-card p-4 hover:bg-muted/30 transition">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
      <div className="text-xs mt-3 text-primary">Otwórz →</div>
    </Link>
  );
}

export default function IpWarehouseHome() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → Magazyn IP</div>
        <div className="text-xs text-muted-foreground">
          UI-only: definicje sieci, generowanie adresów i globalny podgląd przydziałów. Backend (IPAM + provisioning)
          podepniemy później.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <Card
          title="Sieci IP"
          desc="Dodawanie podsieci (/21–/32), ustawienia gateway/DNS, podział sieci jeśli wolna."
          href="/config/ip/networks"
        />
        <Card
          title="Adresy IP"
          desc="Magazyn pojedynczych adresów: status, tryb (DHCP/PPPoE/Static), klient, daty, szczegóły."
          href="/config/ip/addresses"
        />
      </div>

      <div className="rounded-xl border p-4 bg-muted/20">
        <div className="text-sm font-medium">Jak to działa (operatorsko)</div>
        <ul className="list-disc ml-5 mt-2 text-sm text-muted-foreground space-y-1">
          <li>Dodajesz sieć CIDR, ustawiasz gateway + DNS (broadcast liczy się sam).</li>
          <li>System generuje usable adresy i wkłada je do magazynu jako pojedyncze IP.</li>
          <li>Sieć ma przeznaczenie: Kliencka vs Urządzenia Gemini (żeby nie przydzielić infra klientowi).</li>
          <li>Adresy przydzielasz później do usługi w umowie (na razie mock „customerName”).</li>
        </ul>
      </div>
    </div>
  );
}
