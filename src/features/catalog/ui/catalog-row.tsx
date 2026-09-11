import type { ReactNode } from "react";

export function CatalogRow({
  name,
  details,
  children,
}: {
  name: string;
  details?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 py-2">
      <h2 className="min-w-0 truncate text-card font-medium">{name}</h2>
      {details}
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}
