import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { locationRepository } from "@/features/locations/repositories/location-repository";
import { resetHouseholdDbForTests } from "@/lib/db";
import type { Location } from "@/lib/db";
import {
  archiveLocation,
  createLocation,
  listActiveLocations,
  renameLocation,
} from "./manage-locations";

const HOUSEHOLD_A = "household-a";

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("manage-locations", () => {
  it("creates a valid location, trims the name, and assigns sort_order", async () => {
    const kitchen = await createLocation({
      household_id: HOUSEHOLD_A,
      name: "  Kitchen  ",
    });
    const cellar = await createLocation({
      household_id: HOUSEHOLD_A,
      name: "Cellar",
    });

    expect(kitchen.ok).toBe(true);
    expect(cellar.ok).toBe(true);
    if (!kitchen.ok || !cellar.ok) {
      return;
    }
    expect(kitchen.value.name).toBe("Kitchen");
    expect(kitchen.value.sort_order).toBe(0);
    expect(cellar.value.sort_order).toBe(1);
  });

  it("rejects a case-insensitive duplicate", async () => {
    await createLocation({ household_id: HOUSEHOLD_A, name: "Kitchen" });
    expect(
      await createLocation({ household_id: HOUSEHOLD_A, name: "kitchen" }),
    ).toEqual({ ok: false, code: "duplicate_name" });
  });

  it("renames a location without changing sort_order", async () => {
    const created = await createLocation({
      household_id: HOUSEHOLD_A,
      name: "Kitchen",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const renamed = await renameLocation({
      household_id: HOUSEHOLD_A,
      location_id: created.value.id,
      name: "  Pantry  ",
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    expect(renamed.value.name).toBe("Pantry");
    expect(renamed.value.sort_order).toBe(created.value.sort_order);
  });

  it("archives a location and omits it from the active list", async () => {
    const created = await createLocation({
      household_id: HOUSEHOLD_A,
      name: "Kitchen",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const archived = await archiveLocation({
      household_id: HOUSEHOLD_A,
      location_id: created.value.id,
    });
    expect(archived.ok).toBe(true);
    if (!archived.ok) {
      return;
    }
    expect(archived.value.is_active).toBe(false);
    expect(archived.value.sort_order).toBe(created.value.sort_order);
    expect(await listActiveLocations(HOUSEHOLD_A)).toEqual([]);
  });

  it("lists active locations by sort_order then name", async () => {
    const now = "2026-09-09T10:00:00.000Z";
    const zebra: Location = {
      id: "loc-z",
      household_id: HOUSEHOLD_A,
      name: "Zebra",
      is_active: true,
      sort_order: 1,
      created_at: now,
      updated_at: now,
    };
    const apple: Location = {
      id: "loc-a",
      household_id: HOUSEHOLD_A,
      name: "Apple",
      is_active: true,
      sort_order: 1,
      created_at: now,
      updated_at: now,
    };
    const first: Location = {
      id: "loc-first",
      household_id: HOUSEHOLD_A,
      name: "First",
      is_active: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    };
    await locationRepository.put(zebra);
    await locationRepository.put(apple);
    await locationRepository.put(first);

    expect((await listActiveLocations(HOUSEHOLD_A)).map((row) => row.name)).toEqual([
      "First",
      "Apple",
      "Zebra",
    ]);
  });

  it("has no React, Next, Supabase, or sync imports", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "manage-locations.ts"),
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
