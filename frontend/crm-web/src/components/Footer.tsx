export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card">
      <div className="px-6 py-3 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
        <div>
          © {year} Abakus System sp z o.o. / CRM-ISP — właściciel systemu. Wszelkie działania są audytowane.
        </div>
        <div className="flex items-center gap-3">
          <a className="hover:underline" href="/help" rel="noreferrer">Pomoc</a>
          <a className="hover:underline" href="/status" rel="noreferrer">Status</a>
        </div>
      </div>
    </footer>
  );
}