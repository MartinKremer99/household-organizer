import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { householdRepository } from "@/features/household/repositories/household-repository";
import { resetHouseholdDbForTests } from "../db/database";
import { parsePullHouseholdState, pullHouseholdState, reconcileHousehold } from "./reconcile";

const HOUSEHOLD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("parsePullHouseholdState", () => {
  it("maps an ok snapshot", () => {
    const parsed = parsePullHouseholdState({
      ok: true,
      household: {
        id: HOUSEHOLD,
        name: "Home",
        join_code: "ABCDEFGHIJ",
        created_at: "2026-09-10T12:00:00.000Z",
        updated_at: "2026-09-10T12:00:00.000Z",
      },
      membership: {
        household_id: HOUSEHOLD,
        user_id: USER,
        created_at: "2026-09-10T12:00:00.000Z",
      },
      categories: [],
      locations: [],
      products: [],
      inventory_lots: [],
      inventory_operations: [],
      purchased_stock: [],
      shopping_items: [],
      server_cursor: "2026-09-10T12:01:00.000Z",
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.snapshot.household.id).toBe(HOUSEHOLD);
    expect(parsed.snapshot.server_cursor).toBe("2026-09-10T12:01:00.000Z");
  });

  it("passes through membership errors", () => {
    expect(parsePullHouseholdState({ ok: false, code: "no_household" })).toEqual({
      ok: false,
      code: "no_household",
    });
  });
});

describe("pullHouseholdState", () => {
  it("returns transient_error when rpc throws", async () => {
    const supabase = {
      rpc: vi.fn().mockRejectedValue(new Error("offline")),
    };

    await expect(
      pullHouseholdState(supabase as never),
    ).resolves.toEqual({ ok: false, code: "transient_error" });
  });
});

describe("reconcileHousehold", () => {
  it("applies a pulled snapshot", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          ok: true,
          household: {
            id: HOUSEHOLD,
            name: "Home",
            join_code: "ABCDEFGHIJ",
            created_at: "2026-09-10T12:00:00.000Z",
            updated_at: "2026-09-10T12:00:00.000Z",
          },
          membership: {
            household_id: HOUSEHOLD,
            user_id: USER,
            created_at: "2026-09-10T12:00:00.000Z",
          },
          categories: [],
          locations: [],
          products: [],
          inventory_lots: [],
          inventory_operations: [],
          purchased_stock: [],
          shopping_items: [],
          server_cursor: "2026-09-10T12:01:00.000Z",
        },
        error: null,
      }),
    };

    const result = await reconcileHousehold(HOUSEHOLD, supabase as never);
    expect(result).toEqual({ ok: true, server_cursor: "2026-09-10T12:01:00.000Z" });
    expect(await householdRepository.getById(HOUSEHOLD)).toMatchObject({ name: "Home" });
  });
});
