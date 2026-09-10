import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateMinimumStock } from "./minimum-stock";

describe("validateMinimumStock", () => {
  it("accepts zero and positive integers", () => {
    expect(validateMinimumStock(0)).toEqual({ ok: true, value: 0 });
    expect(validateMinimumStock(3)).toEqual({ ok: true, value: 3 });
  });

  it("rejects negative, fractional, and NaN values", () => {
    expect(validateMinimumStock(-1)).toEqual({
      ok: false,
      code: "invalid_minimum_stock",
    });
    expect(validateMinimumStock(1.5)).toEqual({
      ok: false,
      code: "invalid_minimum_stock",
    });
    expect(validateMinimumStock(Number.NaN)).toEqual({
      ok: false,
      code: "invalid_minimum_stock",
    });
  });

  it("has no React, Next, Supabase, or sync imports", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "minimum-stock.ts"),
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
