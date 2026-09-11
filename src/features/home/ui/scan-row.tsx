import Link from "next/link";
import type { ReactNode } from "react";

export const HOME_ROW_LINK_CLASS =
  "block min-h-11 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function ScanRow({
  href,
  name,
  value,
  ariaLabel,
  details,
}: {
  href: string;
  name: string;
  value?: string;
  ariaLabel?: string;
  details?: ReactNode;
}) {
  return (
    <Link href={href} aria-label={ariaLabel} className={HOME_ROW_LINK_CLASS}>
      <div className="flex min-h-11 min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-card font-medium">{name}</p>
        {value ? (
          <p className="shrink-0 text-numeric font-semibold tabular-nums text-foreground">
            {value}
          </p>
        ) : null}
      </div>
      {details}
    </Link>
  );
}
