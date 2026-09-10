"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const PRIMARY_NAV = [
  { href: "/", label: "Home" },
  { href: "/inventory", label: "Inventory" },
  { href: "/shopping", label: "Shopping" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 border-t border-foreground/15 bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-3">
        {PRIMARY_NAV.map(({ href, label }) => {
          const current = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
                  current ? "font-semibold underline" : ""
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
