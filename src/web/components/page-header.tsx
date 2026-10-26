import { useMe } from "@/web/lib/me";

/** Data de hoje no fuso da usuária, ex.: "sexta-feira, 16 de outubro". */
function Today() {
  const me = useMe();
  if (!me) return <span className="inline-block h-3 w-28 animate-pulse rounded bg-muted align-middle" />;
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: me.timezone }).format(new Date());
  return <>{label}</>;
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        {subtitle} · <Today />
      </p>
    </header>
  );
}

/** Espaço reservado enquanto os dados da página carregam. */
export function PageSkeleton({ height = "h-96" }: { height?: string }) {
  return <div className={`${height} animate-pulse rounded-2xl border border-border bg-card`} />;
}
