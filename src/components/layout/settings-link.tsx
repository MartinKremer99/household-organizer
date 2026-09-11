"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsLink() {
  const pathname = usePathname();
  const current =
    pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <Link
      href="/settings"
      aria-current={current ? "page" : undefined}
      className={`inline-flex min-h-11 items-center text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
        current ? "underline" : ""
      }`}
    >
      Settings
    </Link>
  );
}
