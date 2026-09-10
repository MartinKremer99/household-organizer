import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { householdRepository } from "@/features/household/repositories/household-repository";
import { inventoryRepository } from "@/features/inventory/repositories/inventory-repository";
import { productRepository } from "@/features/products/repositories/product-repository";
import { addInventory } from "@/features/inventory/application/mutate-inventory";
import { getHouseholdDb, resetHouseholdDbForTests } from "@/lib/db";
import type {
  Category,
  Household,
  HouseholdMember,
  InventoryLot,
  InventoryOperation,
  Location,
  PendingOperation,
  Product,
} from "@/lib/db";
import { createPendingOperation } from "@/lib/sync/outbox";
import { syncMetadataRepository } from "@/lib/sync/sync-metadata-repository";
import {
  applyHouseholdSnapshot,
  ensureLocalHousehold,
  type HouseholdSnapshot,
} from "./hydrate-household";

const HOUSEHOLD_A = "household-a";
const HOUSEHOLD_B = "household-b";
const USER = "user-1";
const NOW = "2026-09-10T12:00:00.000Z";

function household(id = HOUSEHOLD_A, name = "Home"): Household {
  return {
    id,
    name,
    join_code: "ABCDEFGHIJ",
    created_at: NOW,
    updated_at: NOW,
  };
}

function membership(
  householdId = HOUSEHOLD_A,
  userId = USER,
): HouseholdMember {
  return {
    household_id: householdId,
    user_id: userId,
    created_at: NOW,
  };
}

function category(
  overrides: Partial<Category> & Pick<Category, "id">,
): Category {
  return {
    household_id: HOUSEHOLD_A,
    name: overrides.id,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function location(
  overrides: Partial<Location> & Pick<Location, "id">,
): Location {
  return {
    household_id: HOUSEHOLD_A,
    name: overrides.id,
    is_active: true,
    sort_order: 0,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function product(
  overrides: Partial<Product> & Pick<Product, "id">,
): Product {
  return {
    household_id: HOUSEHOLD_A,
    name: overrides.id,
    category_id: "category-food",
    minimum_stock: 0,
    barcode: null,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function lot(overrides: Partial<InventoryLot> & Pick<InventoryLot, "id">): InventoryLot {
  return {
    household_id: HOUSEHOLD_A,
    product_id: "product-oats",
    location_id: "location-kitchen",
    quantity: 0,
    expiration_date: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function operation(
  overrides: Partial<InventoryOperation> & Pick<InventoryOperation, "id">,
): InventoryOperation {
  return {
    operation_id: overrides.id,
    household_id: HOUSEHOLD_A,
    user_id: USER,
    product_id: "product-oats",
    location_id: "location-kitchen",
    inventory_lot_id: null,
    delta: 1,
    operation_type: "ADD",
    created_at: NOW,
    client_created_at: NOW,
    ...overrides,
  };
}

function snapshot(overrides: Partial<HouseholdSnapshot> = {}): HouseholdSnapshot {
  return {
    household: household(),
    membership: membership(),
    categories: [category({ id: "category-food", name: "Food" })],
    locations: [location({ id: "location-kitchen", name: "Kitchen" })],
    products: [
      product({ id: "product-oats", name: "Oats", category_id: "category-food" }),
    ],
    inventory_lots: [],
    inventory_operations: [],
    purchased_stock: [],
    shopping_items: [],
    server_cursor: "2026-09-10T12:00:00.000Z",
    ...overrides,
  };
}

async function outboxRows(): Promise<PendingOperation[]> {
  return getHouseholdDb().pending_operations.toArray();
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("applyHouseholdSnapshot", () => {
  it("writes household state so addInventory works immediately", async () => {
    await applyHouseholdSnapshot(snapshot());

    const result = await addInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: "product-oats",
      location_id: "location-kitchen",
      quantity: 3,
      operation_id: "op-after-hydrate",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.lots[0]?.quantity).toBe(3);
  });

  it("is idempotent when applied twice", async () => {
    const first = snapshot({
      inventory_lots: [lot({ id: "lot-1", quantity: 4 })],
      inventory_operations: [operation({ id: "op-1", delta: 4, inventory_lot_id: "lot-1" })],
    });

    await applyHouseholdSnapshot(first);
    await applyHouseholdSnapshot(first);

    expect(await householdRepository.getById(HOUSEHOLD_A)).toEqual(first.household);
    expect(await householdRepository.listMembershipsForUser(USER)).toEqual([
      first.membership,
    ]);
    expect(await productRepository.getById(HOUSEHOLD_A, "product-oats")).toEqual(
      first.products[0],
    );
    expect(await inventoryRepository.listLots(HOUSEHOLD_A)).toEqual(first.inventory_lots);
    expect(await getHouseholdDb().inventory_operations.toArray()).toEqual(
      first.inventory_operations,
    );
    expect(await syncMetadataRepository.get(HOUSEHOLD_A)).toMatchObject({
      last_server_cursor: first.server_cursor,
    });
  });

  it("accepts an empty household with seed catalog and no lots", async () => {
    const empty = snapshot({
      products: [],
      inventory_lots: [],
    });

    await applyHouseholdSnapshot(empty);

    expect(await householdRepository.getById(HOUSEHOLD_A)).toEqual(empty.household);
    expect(await getHouseholdDb().categories.toArray()).toHaveLength(1);
    expect(await getHouseholdDb().products.toArray()).toEqual([]);
    expect(await inventoryRepository.listLots(HOUSEHOLD_A)).toEqual([]);
  });

  it("replaces stale entity rows and keeps archived products with zero lots", async () => {
    await applyHouseholdSnapshot(
      snapshot({
        products: [
          product({ id: "stale-product", name: "Stale" }),
          product({ id: "keep-archived", name: "Flour", is_active: false }),
        ],
        inventory_lots: [lot({ id: "stale-lot", product_id: "stale-product", quantity: 9 })],
      }),
    );

    await applyHouseholdSnapshot(
      snapshot({
        products: [product({ id: "keep-archived", name: "Flour", is_active: false })],
        inventory_lots: [lot({ id: "zero-lot", product_id: "keep-archived", quantity: 0 })],
      }),
    );

    expect(await productRepository.getById(HOUSEHOLD_A, "stale-product")).toBeNull();
    expect(await productRepository.getById(HOUSEHOLD_A, "keep-archived")).toMatchObject({
      is_active: false,
    });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "stale-lot")).toBeNull();
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "zero-lot")).toMatchObject({
      quantity: 0,
    });
  });

  it("does not delete pending or failed outbox rows", async () => {
    const pending = createPendingOperation({
      household_id: HOUSEHOLD_A,
      operation_id: "op-pending",
      operation_type: "INVENTORY_DELTA",
      payload: {
        product_id: "product-oats",
        location_id: "location-kitchen",
        operation_type: "ADD",
        allocations: [{ inventory_lot_id: "lot-local", delta: 1 }],
      },
    });
    const failed: PendingOperation = {
      ...createPendingOperation({
        household_id: HOUSEHOLD_A,
        operation_id: "op-failed",
        operation_type: "INVENTORY_DELTA",
        payload: {
          product_id: "product-oats",
          location_id: "location-kitchen",
          operation_type: "ADD",
          allocations: [{ inventory_lot_id: "lot-failed", delta: 1 }],
        },
      }),
      status: "failed",
      last_error: "duplicate_name",
    };
    await getHouseholdDb().pending_operations.bulkPut([pending, failed]);

    await applyHouseholdSnapshot(
      snapshot({
        inventory_lots: [lot({ id: "lot-server", quantity: 2 })],
      }),
    );

    const rows = await outboxRows();
    expect(rows.map((row) => row.operation_id).sort()).toEqual(["op-failed", "op-pending"]);
    expect(rows.find((row) => row.operation_id === "op-failed")?.status).toBe("failed");
  });

  it("does not delete a product just because it has no lots", async () => {
    await applyHouseholdSnapshot(
      snapshot({
        products: [product({ id: "product-oats", name: "Oats" })],
        inventory_lots: [],
      }),
    );

    expect(await productRepository.getById(HOUSEHOLD_A, "product-oats")).not.toBeNull();
  });

  it("drops extra memberships for the same user on other households", async () => {
    await householdRepository.put(household(HOUSEHOLD_B, "Other"));
    await householdRepository.putMember(membership(HOUSEHOLD_B, USER));

    await applyHouseholdSnapshot(snapshot());

    expect(await householdRepository.listMembershipsForUser(USER)).toEqual([
      membership(),
    ]);
  });
});

describe("ensureLocalHousehold", () => {
  it("returns the local household without pulling when membership already exists", async () => {
    await householdRepository.put(household());
    await householdRepository.putMember(membership());
    const pull = vi.fn();

    const result = await ensureLocalHousehold({
      userId: USER,
      pullHouseholdState: pull,
    });

    expect(result).toEqual({ ok: true, household: household() });
    expect(pull).not.toHaveBeenCalled();
  });

  it("pulls and applies when Dexie has no household", async () => {
    const pulled = snapshot();
    const pull = vi.fn().mockResolvedValue({ ok: true, snapshot: pulled });

    const result = await ensureLocalHousehold({
      userId: USER,
      pullHouseholdState: pull,
    });

    expect(result).toEqual({ ok: true, household: pulled.household });
    expect(pull).toHaveBeenCalledTimes(1);
    expect(await householdRepository.getById(HOUSEHOLD_A)).toEqual(pulled.household);
  });

  it("returns not_authenticated for a blank user", async () => {
    const pull = vi.fn();

    const result = await ensureLocalHousehold({
      userId: "  ",
      pullHouseholdState: pull,
    });

    expect(result).toEqual({ ok: false, code: "not_authenticated" });
    expect(pull).not.toHaveBeenCalled();
  });

  it("returns the pull failure when Dexie is still empty", async () => {
    const pull = vi.fn().mockResolvedValue({ ok: false, code: "transient_error" });

    const result = await ensureLocalHousehold({
      userId: USER,
      pullHouseholdState: pull,
    });

    expect(result).toEqual({ ok: false, code: "transient_error" });
    expect(await householdRepository.getById(HOUSEHOLD_A)).toBeNull();
  });
});
