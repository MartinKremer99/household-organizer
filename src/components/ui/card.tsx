import type { ReactNode } from "react";

export type CardTitleAs = "h2" | "p";

export type CardProps = {
  title: string;
  titleAs?: CardTitleAs;
  children: ReactNode;
};

export function Card({ title, titleAs = "h2", children }: CardProps) {
  const Title = titleAs;

  return (
    <section className="rounded-card border border-border bg-surface p-3">
      <Title className="break-words text-card font-medium tracking-tight">{title}</Title>
      <div className="mt-2 text-body text-muted-foreground">{children}</div>
    </section>
  );
}
