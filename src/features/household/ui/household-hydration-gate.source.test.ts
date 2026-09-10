import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("HouseholdHydrationGate source", () => {
  it("does not import Dexie, repositories, Supabase, or sync metadata", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "household-hydration-gate.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/dexie/i);
    expect(source).not.toMatch(/@\/lib\/db/);
    expect(source).not.toMatch(/repositories/);
    expect(source).not.toMatch(/@\/lib\/supabase/);
    expect(source).not.toMatch(/sync-metadata/);
    expect(source).not.toMatch(/outbox/);
    expect(source).not.toMatch(/uploader/);
  });
});
