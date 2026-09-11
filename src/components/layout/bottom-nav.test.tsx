import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { BottomNav } from "./bottom-nav";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: "page";
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

function anchors(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => {
    const attrs = match[1];
    return {
      href: attrs.match(/href="([^"]*)"/)?.[1] ?? "",
      label: match[2].replace(/<[^>]+>/g, "").trim(),
      current: /aria-current="page"/.test(attrs),
    };
  });
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walkFiles(full) : [full];
  });
}

describe("BottomNav", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/");
  });

  it("renders the three primary destinations with accessible names", () => {
    const links = anchors(renderToStaticMarkup(<BottomNav />));

    expect(links).toEqual([
      { href: "/", label: "Home", current: true },
      { href: "/inventory", label: "Inventory", current: false },
      { href: "/shopping", label: "Shopping", current: false },
    ]);
  });

  it("marks Inventory current for inventory detail routes", () => {
    vi.mocked(usePathname).mockReturnValue("/inventory/prod-1");
    const links = anchors(renderToStaticMarkup(<BottomNav />));

    expect(links.find((link) => link.href === "/")?.current).toBe(false);
    expect(links.find((link) => link.href === "/inventory")?.current).toBe(true);
    expect(links.find((link) => link.href === "/shopping")?.current).toBe(false);
  });

  it("does not treat unrelated routes as Home or Shopping", () => {
    vi.mocked(usePathname).mockReturnValue("/settings");
    const links = anchors(renderToStaticMarkup(<BottomNav />));

    expect(links.find((link) => link.href === "/")?.current).toBe(false);
    expect(links.find((link) => link.href === "/inventory")?.current).toBe(false);
    expect(links.find((link) => link.href === "/shopping")?.current).toBe(false);
  });

  it("marks Shopping current for shopping subpaths", () => {
    vi.mocked(usePathname).mockReturnValue("/shopping/purchased");
    const links = anchors(renderToStaticMarkup(<BottomNav />));

    expect(links.find((link) => link.href === "/shopping")?.current).toBe(true);
    expect(links.find((link) => link.href === "/inventory")?.current).toBe(false);
  });
});

describe("presentational UI source", () => {
  it("does not import Dexie, Supabase, sync, or repositories", () => {
    const roots = [
      join(dirname(fileURLToPath(import.meta.url)), "..", "layout"),
      join(dirname(fileURLToPath(import.meta.url)), "..", "home"),
      join(dirname(fileURLToPath(import.meta.url)), "..", "ui"),
    ];
    const sources = roots
      .filter((dir) => existsSync(dir))
      .flatMap((dir) => walkFiles(dir))
      .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(sources).not.toMatch(/dexie/i);
    expect(sources).not.toMatch(/@\/lib\/db/);
    expect(sources).not.toMatch(/@\/lib\/supabase/);
    expect(sources).not.toMatch(/outbox/);
    expect(sources).not.toMatch(/uploader/);
    expect(sources).not.toMatch(/syncHousehold/);
    expect(sources).not.toMatch(/repositories/);
  });
});
