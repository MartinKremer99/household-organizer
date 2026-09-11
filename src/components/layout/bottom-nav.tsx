"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export const PRIMARY_NAV = [
  { href: "/", label: "Home" },
  { href: "/inventory", label: "Inventory" },
  { href: "/shopping", label: "Shopping" },
] as const;

function isCurrent(pathname: string, href: (typeof PRIMARY_NAV)[number]["href"]): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavIcon({ name }: { name: (typeof PRIMARY_NAV)[number]["label"] }): ReactNode {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    "aria-hidden": true,
  } as const;

  if (name === "Home") {
    return (
      <svg {...common}>
        <path d="M3.5 9.5 10 3.5l6.5 6V16a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V9.5Z" />
        <path d="M8 16.5v-5h4v5" />
      </svg>
    );
  }
  if (name === "Inventory") {
    return (
      <svg {...common}>
        <path d="M3.5 6.5h13v10h-13z" />
        <path d="M3.5 6.5 10 3.5l6.5 3" />
        <path d="M10 3.5v13" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4.5 6.5h11l-1 9h-9l-1-9Z" />
      <path d="M7 6.5V5a3 3 0 0 1 6 0v1.5" />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-3">
        {PRIMARY_NAV.map(({ href, label }) => {
          const current = isCurrent(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  current ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {current ? (
                  <span className="absolute inset-x-4 top-0 h-0.5 bg-primary" aria-hidden="true" />
                ) : null}
                <NavIcon name={label} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
