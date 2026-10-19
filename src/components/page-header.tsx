import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";

/** Data de hoje no fuso da usuária, ex.: "sexta-feira, 16 de outubro". */
async function Today() {
  const user = await getCurrentUser();
  const label = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: user.timezone,
  }).format(new Date());
  return <>{label}</>;
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        {subtitle} ·{" "}
        <Suspense fallback={<span className="inline-block h-3 w-28 animate-pulse rounded bg-muted align-middle" />}>
          <Today />
        </Suspense>
      </p>
    </header>
  );
}
