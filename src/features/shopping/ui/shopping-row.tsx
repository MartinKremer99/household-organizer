import type { ReactNode } from "react";

export function ShoppingRow({
  name,
  quantity,
  showNote,
  children,
}: {
  name: string;
  quantity: ReactNode;
  showNote?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 py-2">
      <div className="flex min-h-11 min-w-0 items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-card font-medium">{name}</h2>
        <p className="shrink-0 text-numeric font-semibold tabular-nums text-foreground">
          {quantity}
        </p>
      </div>
      {showNote ? <p className="text-label text-muted-foreground">Note</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}
