import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateCatalogName } from "./name";

describe("validateCatalogName", () => {
  it("trims a valid name", () => {
    expect(validateCatalogName("  Food  ")).toEqual({
      ok: true,
      value: "Food",
    });
  });

  it("rejects an empty name", () => {
    expect(validateCatalogName("   ")).toEqual({
      ok: false,
      code: "invalid_name",
    });
  });

  it("rejects a name longer than 80 characters", () => {
    expect(validateCatalogName("x".repeat(81))).toEqual({
      ok: false,
      code: "invalid_name",
    });
  });

  it("has no React, Next, Supabase, or sync imports", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "name.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
    expect(source).not.toMatch(/@\/lib\/supabase/);
    expect(source).not.toMatch(/@\/lib\/sync/);
    expect(source).not.toMatch(/outbox/);
    expect(source).not.toMatch(/createClient/);
  });
});
