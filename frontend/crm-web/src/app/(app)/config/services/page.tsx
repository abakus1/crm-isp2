"use client";

import Link from "next/link";

function Card({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border bg-card p-4 hover:bg-muted/30 transition"
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
      <div className="text-xs mt-3 text-primary">Otwórz →</div>
    </Link>
  );
}

export default function ServicesConfigHome() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → Usługi</div>
        <div className="text-xs text-muted-foreground">
          Ślepe UI: konfigurujesz definicje usług, archiwum i harmonogramy zmian. Backend podepniemy później.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <Card
          title="Lista usług"
          desc="Wszystkie usługi + liczba subskrybentów (podgląd operacyjny)."
          href="/config/services/list"
        />
        <Card
          title="Kategorie usług"
          desc="Dodawanie/edycja/archiwum kategorii (Service Families)."
          href="/config/services/families"
        />
        <Card
          title="Okresy usług"
          desc="Dodawanie/edycja/archiwum okresów (Contract Terms)."
          href="/config/services/terms"
        />
        <Card
          title="Usługi główne"
          desc="Plany główne (Primary): cenniki, archiwum, harmonogram zmian."
          href="/config/services/primary"
        />
        <Card
          title="Usługi dodatkowe"
          desc="Plany dodatkowe (Addons): cenniki, archiwum, harmonogram zmian."
          href="/config/services/addons"
        />
      </div>

      <div className="rounded-xl border p-4 bg-muted/20">
        <div className="text-sm font-medium">Jak testujesz czy to jest “to”?</div>
        <ul className="list-disc ml-5 mt-2 text-sm text-muted-foreground space-y-1">
          <li>Przejdź przez wszystkie zakładki i sprawdź czy język/flow odpowiada temu, co opisujesz.</li>
          <li>Sprawdź “Archiwizuj” i “Przywróć” — zawsze masz wybór: natychmiast vs zaplanowane.</li>
          <li>Sprawdź tryb grupowy (multi-select) — możesz zaplanować zmianę dla wielu pozycji naraz.</li>
        </ul>
      </div>
    </div>
  );
}
