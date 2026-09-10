import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { householdRepository } from "@/features/household/repositories/household-repository";
import { getHouseholdDb, resetHouseholdDbForTests } from "@/lib/db";
import type { Household, HouseholdMember } from "@/lib/db";
import { getLocalHousehold, renameHousehold } from "./manage-household";

const HOUSEHOLD_A = "household-a";
const HOUSEHOLD_B = "household-b";
const NOW = "2026-09-10T12:00:00.000Z";

function household(overrides: Partial<Household> = {}): Household {
  return {
    id: HOUSEHOLD_A,
    name: "Home",
    join_code: "ABCDEFGHIJ",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function member(overrides: Partial<HouseholdMember> = {}): HouseholdMember {
  return {
    household_id: HOUSEHOLD_A,
    user_id: "user-1",
    created_at: NOW,
    ...overrides,
  };
}

async function seedLocal(row: Household = household()): Promise<Household> {
  await householdRepository.put(row);
  await householdRepository.putMember(member({ household_id: row.id }));
  return row;
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("manage-household", () => {
  it("returns the single local household", async () => {
    const row = await seedLocal();
    expect(await getLocalHousehold()).toEqual(row);
  });

  it("returns null when membership is missing or not unique", async () => {
    expect(await getLocalHousehold()).toBeNull();

    await householdRepository.put(household());
    expect(await getLocalHousehold()).toBeNull();

    await householdRepository.putMember(member());
    await householdRepository.put(household({ id: HOUSEHOLD_B, name: "Other" }));
    await householdRepository.putMember(
      member({ household_id: HOUSEHOLD_B, user_id: "user-2" }),
    );
    expect(await getLocalHousehold()).toBeNull();
  });

  it("renames, trims, and enqueues one RENAME_HOUSEHOLD row", async () => {
    await seedLocal();

    const renamed = await renameHousehold({
      householdId: HOUSEHOLD_A,
      name: "  New Home  ",
    });

    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    expect(renamed.value.name).toBe("New Home");
    expect(renamed.value.join_code).toBe("ABCDEFGHIJ");
    expect(await getLocalHousehold()).toEqual(renamed.value);
    expect(await getHouseholdDb().pending_operations.toArray()).toMatchObject([
      {
        operation_type: "RENAME_HOUSEHOLD",
        payload: { name: "New Home" },
        household_id: HOUSEHOLD_A,
      },
    ]);
  });

  it("rejects an invalid name without writing or enqueueing", async () => {
    await seedLocal();

    expect(await renameHousehold({ householdId: HOUSEHOLD_A, name: "   " })).toEqual({
      ok: false,
      code: "invalid_name",
    });
    expect(await getLocalHousehold()).toMatchObject({ name: "Home" });
    expect(await getHouseholdDb().pending_operations.count()).toBe(0);
  });

  it("rejects a foreign household id without writing", async () => {
    await seedLocal();

    expect(await renameHousehold({ householdId: HOUSEHOLD_B, name: "Other" })).toEqual({
      ok: false,
      code: "invalid_household",
    });
    expect(await getLocalHousehold()).toMatchObject({ name: "Home" });
    expect(await getHouseholdDb().pending_operations.count()).toBe(0);
  });

  it("is a no-op when the trimmed name is unchanged", async () => {
    await seedLocal();

    const result = await renameHousehold({
      householdId: HOUSEHOLD_A,
      name: "  Home  ",
    });

    expect(result).toEqual({ ok: true, value: household() });
    expect(await getHouseholdDb().pending_operations.count()).toBe(0);
  });

  it("has no React, Next, or Supabase imports and uses the outbox", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "manage-household.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
    expect(source).not.toMatch(/@\/lib\/supabase/);
    expect(source).not.toMatch(/createClient/);
    expect(source).toMatch(/@\/lib\/sync\/outbox/);
  });
});
