"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { formatKind, formatStatus, seedSubscribers, type SubscriberRecord } from "@/lib/mockSubscribers";

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs bg-muted/20">{children}</span>;
}

function Row({ s, onOpen }: { s: SubscriberRecord; onOpen: (id: string) => void }) {
  const href = `/subscribers/${encodeURIComponent(s.id)}`;

  return (
    <tr
      className="border-b last:border-b-0 cursor-pointer hover:bg-muted/20"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(s.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(s.id);
        }
      }}
      aria-label={`Otwórz abonenta: ${s.display_name}`}
    >
      <td className="py-3 pr-3">
        <div className="text-sm font-medium">
          <Link className="hover:underline" href={href} onClick={(e) => e.stopPropagation()}>
            {s.display_name}
          </Link>
        </div>
        <div className="text-xs text-muted-foreground">ID: {s.id}</div>
      </td>

      <td className="py-3 pr-3 text-sm">
        <Badge>{formatKind(s.kind)}</Badge>
      </td>

      <td className="py-3 pr-3 text-sm">
        <Badge>{formatStatus(s.status)}</Badge>
      </td>

      <td className="py-3 pr-3 text-sm">
        <div className="text-sm">{s.email ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{s.phone ?? "—"}</div>
      </td>

      <td className="py-3 pr-3 text-sm">{s.created_at}</td>

      <td className="py-3 text-right">
        <Link
          href={href}
          className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40"
          onClick={(e) => e.stopPropagation()}
        >
          Otwórz
        </Link>
      </td>
    </tr>
  );
}

export default function SubscribersListPage() {
  const all = useMemo(() => seedSubscribers(), []);
  const router = useRouter();

  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((s) => (!onlyActive ? true : s.status === "active"))
      .filter((s) => {
        if (!needle) return true;
        return (
          s.display_name.toLowerCase().includes(needle) ||
          (s.email ?? "").toLowerCase().includes(needle) ||
          (s.phone ?? "").toLowerCase().includes(needle) ||
          (s.nip ?? "").toLowerCase().includes(needle) ||
          s.id.toLowerCase().includes(needle)
        );
      });
  }, [all, q, onlyActive]);

  const openSubscriber = (id: string) => {
    router.push(`/subscribers/${encodeURIComponent(id)}`);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Abonenci</div>
          <div className="text-xs text-muted-foreground">Kliknij w wiersz, żeby otworzyć kartę abonenta.</div>
        </div>

        <Link
          href="/subscribers/new"
          className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
        >
          + Dodaj abonenta
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj: nazwa, e-mail, telefon, NIP, ID…"
            className="w-full md:max-w-md rounded-md border bg-background px-3 py-2 text-sm"
          />

          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            tylko aktywni
          </label>

          <div className="text-xs text-muted-foreground md:ml-auto">Wyniki: {rows.length}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3 font-medium">Abonent</th>
                <th className="py-2 pr-3 font-medium">Rodzaj</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Kontakt</th>
                <th className="py-2 pr-3 font-medium">Utworzono</th>
                <th className="py-2 font-medium text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>{rows.map((s) => <Row key={s.id} s={s} onOpen={openSubscriber} />)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}