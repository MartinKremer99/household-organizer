import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("inventory UI source", () => {
  it("does not import Dexie, repositories, Supabase, or sync", () => {
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
    expect(sources).not.toMatch(/selectLotsForConsumption/);
    expect(sources).not.toMatch(/isExpired/);
    expect(sources).not.toMatch(/isExpiringWithin/);
    expect(sources).not.toMatch(/validateCatalogName/);
    expect(sources).not.toMatch(/validateMinimumStock/);
  });

  it("does not call addInventory from the inventory overview", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const overview = readFileSync(join(dir, "inventory-overview-screen.tsx"), "utf8");

    expect(overview).not.toMatch(/addInventory/);
    expect(overview).not.toMatch(/mutate-inventory/);
  });
});
