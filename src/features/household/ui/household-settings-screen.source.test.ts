import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("HouseholdSettingsScreen source", () => {
  it("does not import Dexie, repositories, Supabase, or outbox", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "household-settings-screen.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/dexie/i);
    expect(source).not.toMatch(/@\/lib\/db/);
    expect(source).not.toMatch(/repositories/);
    expect(source).not.toMatch(/@\/lib\/supabase/);
    expect(source).not.toMatch(/outbox/);
    expect(source).not.toMatch(/uploader/);
    expect(source).toMatch(/manage-household/);
  });
});
