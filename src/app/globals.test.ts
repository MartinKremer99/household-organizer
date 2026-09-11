import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "globals.css"), "utf8");

describe("design tokens", () => {
  it("locks light mode and exposes semantic colors", () => {
    expect(css).toContain("color-scheme: light");
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/);
    expect(css).toContain("--background: #f4f1ea");
    expect(css).toContain("--surface: #fffcf7");
    expect(css).toContain("--primary: #243126");
    expect(css).toContain("--danger: #9b2c2c");
    expect(css).toContain("--muted-foreground: #6a6558");
    expect(css).toContain("--radius-control: var(--control-radius)");
  });
});
