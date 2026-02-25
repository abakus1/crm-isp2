import { Suspense } from "react";
import AddonPlansClient from "./AddonPlansClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Ładowanie…</div>}>
      <AddonPlansClient />
    </Suspense>
  );
}
