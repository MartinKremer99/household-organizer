import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("notifications UI source", () => {
  it("does not import Dexie, repositories, Supabase, sync, or domain calculations", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(dir)
      .filter(
        (file) =>
          (file.endsWith(".ts") || file.endsWith(".tsx")) &&
          !file.includes(".test."),
      )
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .join("\n");

    expect(sources).not.toMatch(/dexie/i);
    expect(sources).not.toMatch(/@\/lib\/db/);
    expect(sources).not.toMatch(/repositories/);
    expect(sources).not.toMatch(/@\/lib\/supabase/);
    expect(sources).not.toMatch(/outbox/);
    expect(sources).not.toMatch(/uploader/);
    expect(sources).not.toMatch(/syncHousehold/);
    expect(sources).not.toMatch(/triggerHouseholdSync/);
    expect(sources).not.toMatch(/isExpired/);
    expect(sources).not.toMatch(/isExpiringWithin/);
    expect(sources).not.toMatch(/isLowStock/);
    expect(sources).not.toMatch(/setInterval/);
    expect(sources).not.toMatch(/setTimeout/);
    expect(sources).not.toMatch(/periodicsync/i);
    expect(sources).not.toMatch(/Background Sync/i);
    expect(sources).not.toMatch(/localStorage/);
  });
});
