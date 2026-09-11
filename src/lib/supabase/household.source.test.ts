import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("household membership cache", () => {
  it("dedupes getOwnHouseholdId with React cache", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "household.ts"),
      "utf8",
    );

    expect(source).toMatch(/cache\(/);
  });
});
