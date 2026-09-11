import type { ReactNode } from "react";

export type CardProps = {
  title: string;
  children: ReactNode;
};

export function Card({ title, children }: CardProps) {
  return (
    <section className="rounded-md border border-foreground/20 p-3">
      <h2 className="break-words text-sm font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 text-sm text-foreground/80">{children}</div>
    </section>
  );
}
