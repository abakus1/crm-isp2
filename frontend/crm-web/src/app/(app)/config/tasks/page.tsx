"use client";

import Link from "next/link";

function Card({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="block rounded-xl border bg-card p-4 transition hover:bg-muted/30">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
      <div className="mt-3 text-xs text-primary">Otwórz →</div>
    </Link>
  );
}

export default function TasksConfigHome() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-sm font-semibold">Konfiguracja → Zadania</div>
        <div className="text-xs text-muted-foreground">
          UI + mocki pod planowanie operacyjne. Tu ustawiamy ekipy, kategorie automatyczne, okna czasowe i czas pracy — żeby klient widział wolne sloty, a nie bebechy kalendarza pracowników.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card href="/config/tasks/teams" title="Zespoły" desc="Agregowanie pracowników do ekip typu Ekipa monterska 1 / Serwis Kraków." />
        <Card href="/config/tasks/categories" title="Kategorie automatyczne" desc="Typy zadań generowanych przez system: podłączenie, awaria, wizyta serwisowa, demontaż." />
        <Card href="/config/tasks/windows" title="Okna czasowe" desc="Definicje slotów dla podłączeń i serwisu — długość, dni tygodnia, zakres godzin, pojemność." />
        <Card href="/config/tasks/work-schedules" title="Czas pracy" desc="Szablony czasu pracy i przypięcia do pracowników, żeby wolne sloty nie były fantazją po kawie." />
      </div>

      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
        Flow docelowe jest proste: <span className="font-medium text-foreground">kategoria zadania → okno czasowe → kwalifikowane ekipy → czas pracy → wolny slot dla klienta</span>. Bez tej warstwy panel klienta pokazywałby czary-mary zamiast realnych terminów.
      </div>
    </div>
  );
}
