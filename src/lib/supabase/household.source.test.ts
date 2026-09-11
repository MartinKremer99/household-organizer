import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("household membership cache", () => {
  it("dedupes getOwnHouseholdId with React cache and keeps the SQL path cookie-free", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "household.ts"),
      "utf8",
    );
    const queryFn = source.slice(
      source.indexOf("export const getOwnHouseholdId"),
      source.indexOf("export const resolveOwnHouseholdId"),
    );

    expect(queryFn).toMatch(/cache\(/);
    expect(queryFn).not.toMatch(/cookie/i);
    expect(source).toMatch(/export const resolveOwnHouseholdId/);
    expect(source).not.toMatch(/document\.cookie/);
  });
});
