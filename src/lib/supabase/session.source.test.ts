import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("live user id cookie helper", () => {
  it("dedupes cookie getUser with React cache", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "session.ts"),
      "utf8",
    );

    expect(source).toMatch(/export const getLiveUserIdFromCookies = cache\(/);
  });
});
