import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateBarcode } from "./barcode";

describe("validateBarcode", () => {
  it("treats empty input as optional", () => {
    expect(validateBarcode(null)).toEqual({ ok: true, value: null });
    expect(validateBarcode(undefined)).toEqual({ ok: true, value: null });
    expect(validateBarcode("")).toEqual({ ok: true, value: null });
    expect(validateBarcode("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts 6 to 14 digits", () => {
    expect(validateBarcode("123456")).toEqual({ ok: true, value: "123456" });
    expect(validateBarcode(" 0123456789012 ")).toEqual({
      ok: true,
      value: "0123456789012",
    });
    expect(validateBarcode("12345678901234")).toEqual({
      ok: true,
      value: "12345678901234",
    });
  });

  it("rejects letters, symbols, and unreasonable length", () => {
    expect(validateBarcode("abc123")).toEqual({ ok: false, code: "invalid_barcode" });
    expect(validateBarcode("12345")).toEqual({ ok: false, code: "invalid_barcode" });
    expect(validateBarcode("123456789012345")).toEqual({
      ok: false,
      code: "invalid_barcode",
    });
    expect(validateBarcode("12 345678")).toEqual({ ok: false, code: "invalid_barcode" });
  });

  it("has no React, Next, Supabase, or sync imports", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "barcode.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
    expect(source).not.toMatch(/@\/lib\/supabase/);
    expect(source).not.toMatch(/@\/lib\/sync/);
    expect(source).not.toMatch(/outbox/);
  });
});
