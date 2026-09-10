import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { householdRepository } from "@/features/household/repositories/household-repository";
import { locationRepository } from "@/features/locations/repositories/location-repository";
import { productRepository } from "@/features/products/repositories/product-repository";
import { getHouseholdDb, resetHouseholdDbForTests } from "@/lib/db";
import type { Household, InventoryLot, Location, Product } from "@/lib/db";
import { inventoryRepository } from "../repositories/inventory-repository";
import { addInventory, moveInventory, removeInventory } from "./mutate-inventory";

const HOUSEHOLD_A = "household-a";
const HOUSEHOLD_B = "household-b";
const USER = "user-1";
const PRODUCT_A = "product-a";
const PRODUCT_B = "product-b";
const LOCATION_A = "location-a";
const LOCATION_B = "location-b";

function household(id: string): Household {
  return {
    id,
    name: id,
    join_code: "ABCDEFGHIJ",
    created_at: "2026-09-09T10:00:00.000Z",
    updated_at: "2026-09-09T10:00:00.000Z",
  };
}

function product(id: string, householdId: string): Product {
  return {
    id,
    household_id: householdId,
    name: id,
    category_id: "category-1",
    minimum_stock: 0,
    barcode: null,
    is_active: true,
    created_at: "2026-09-09T10:00:00.000Z",
    updated_at: "2026-09-09T10:00:00.000Z",
  };
}

function location(id: string, householdId: string): Location {
  return {
    id,
    household_id: householdId,
    name: id,
    is_active: true,
    sort_order: 0,
    created_at: "2026-09-09T10:00:00.000Z",
    updated_at: "2026-09-09T10:00:00.000Z",
  };
}

function lot(overrides: Partial<InventoryLot> & Pick<InventoryLot, "id">): InventoryLot {
  return {
    household_id: HOUSEHOLD_A,
    product_id: PRODUCT_A,
    location_id: LOCATION_A,
    quantity: 0,
    expiration_date: null,
    created_at: "2026-09-09T10:00:00.000Z",
    updated_at: "2026-09-09T10:00:00.000Z",
    ...overrides,
  };
}

async function seedHousehold(id: string): Promise<void> {
  await householdRepository.put(household(id));
  await productRepository.put(product(id === HOUSEHOLD_B ? PRODUCT_B : PRODUCT_A, id));
  await locationRepository.put(location(id === HOUSEHOLD_B ? LOCATION_B : LOCATION_A, id));
}

async function seedBothHouseholds(): Promise<void> {
  await seedHousehold(HOUSEHOLD_A);
  await seedHousehold(HOUSEHOLD_B);
}

async function historyRows() {
  return getHouseholdDb().inventory_operations.toArray();
}

async function outboxRows() {
  return getHouseholdDb().pending_operations.toArray();
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("addInventory", () => {
  it("adds a positive quantity to a new lot", async () => {
    await seedHousehold(HOUSEHOLD_A);

    const result = await addInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 4,
      operation_id: "op-add-1",
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      return;
    }

    expect(result.value.lots).toHaveLength(1);
    expect(result.value.lots[0]?.quantity).toBe(4);
    expect(result.value.operation_id).toBe("op-add-1");
  });

  it("increments an existing compatible lot instead of replacing it", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(
      lot({ id: "lot-undated", quantity: 2, expiration_date: null }),
    );

    const result = await addInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 3,
      operation_id: "op-add-2",
    });

    expect(result.ok).toBe(true);
    const lots = await inventoryRepository.listLotsForProductAtLocation(
      HOUSEHOLD_A,
      PRODUCT_A,
      LOCATION_A,
    );
    expect(lots).toHaveLength(1);
    expect(lots[0]?.id).toBe("lot-undated");
    expect(lots[0]?.quantity).toBe(5);
  });

  it("preserves expiration on the written lot", async () => {
    await seedHousehold(HOUSEHOLD_A);

    const result = await addInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 2,
      expiration_date: "2027-01-10",
      operation_id: "op-add-exp",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.lots[0]?.expiration_date).toBe("2027-01-10");
  });

  it("records one ADD inventory operation and a matching outbox delta", async () => {
    await seedHousehold(HOUSEHOLD_A);

    await addInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 2,
      operation_id: "op-shared",
      client_created_at: "2026-09-09T10:00:00.000Z",
    });

    const history = await historyRows();
    const pending = await outboxRows();

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      operation_id: "op-shared",
      operation_type: "ADD",
      delta: 2,
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.operation_id).toBe("op-shared");
    expect(pending[0]?.operation_type).toBe("INVENTORY_DELTA");
    expect(pending[0]?.payload).toEqual({
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      operation_type: "ADD",
      allocations: [
        {
          inventory_lot_id: history[0]?.inventory_lot_id,
          delta: 2,
          expiration_date: null,
        },
      ],
      client_created_at: "2026-09-09T10:00:00.000Z",
    });
    expect(pending[0]?.payload).not.toHaveProperty("quantity");
  });

  it("keeps separate lots for different expiration dates", async () => {
    await seedHousehold(HOUSEHOLD_A);

    await addInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 2,
      expiration_date: "2027-01-10",
      operation_id: "op-exp-a",
    });
    await addInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 3,
      expiration_date: "2027-06-20",
      operation_id: "op-exp-b",
    });

    const lots = await inventoryRepository.listLotsForProductAtLocation(
      HOUSEHOLD_A,
      PRODUCT_A,
      LOCATION_A,
    );
    expect(lots).toHaveLength(2);
    expect(lots.map((row) => row.quantity).sort()).toEqual([2, 3]);
  });

  it("rejects zero and negative quantities", async () => {
    await seedHousehold(HOUSEHOLD_A);

    expect(
      await addInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        location_id: LOCATION_A,
        quantity: 0,
        operation_id: "op-add-zero",
      }),
    ).toEqual({ ok: false, code: "invalid_quantity" });

    expect(
      await addInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        location_id: LOCATION_A,
        quantity: -1,
        operation_id: "op-add-neg",
      }),
    ).toEqual({ ok: false, code: "invalid_quantity" });
    expect(await historyRows()).toHaveLength(0);
    expect(await outboxRows()).toHaveLength(0);
  });
});

describe("removeInventory", () => {
  it("removes sufficient stock from a targeted lot", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(lot({ id: "lot-1", quantity: 5 }));

    const result = await removeInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 2,
      inventory_lot_id: "lot-1",
      operation_id: "op-rm-1",
    });

    expect(result.ok).toBe(true);
    const updated = await inventoryRepository.getLotById(HOUSEHOLD_A, "lot-1");
    expect(updated?.quantity).toBe(3);
  });

  it("respects FEFO across dated and undated lots", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(
      lot({ id: "undated", quantity: 4, expiration_date: null }),
    );
    await inventoryRepository.putLot(
      lot({ id: "later", quantity: 3, expiration_date: "2027-06-20" }),
    );
    await inventoryRepository.putLot(
      lot({ id: "soon", quantity: 2, expiration_date: "2027-01-10" }),
    );

    const result = await removeInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 4,
      operation_id: "op-fefo",
    });

    expect(result.ok).toBe(true);
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "soon")).toMatchObject({
      quantity: 0,
    });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "later")).toMatchObject({
      quantity: 1,
    });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "undated")).toMatchObject({
      quantity: 4,
    });
  });

  it("does not touch a sibling lot when removing from an explicit lot", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(
      lot({ id: "soon", quantity: 2, expiration_date: "2027-01-10" }),
    );
    await inventoryRepository.putLot(
      lot({ id: "later", quantity: 5, expiration_date: "2027-06-20" }),
    );

    await removeInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 1,
      inventory_lot_id: "later",
      operation_id: "op-explicit",
    });

    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "soon")).toMatchObject({
      quantity: 2,
    });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "later")).toMatchObject({
      quantity: 4,
    });
  });

  it("records one REMOVE history row and outbox payload", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(lot({ id: "lot-1", quantity: 5 }));

    await removeInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 2,
      inventory_lot_id: "lot-1",
      operation_id: "op-rm-hist",
    });

    const history = await historyRows();
    const pending = await outboxRows();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      operation_id: "op-rm-hist",
      operation_type: "REMOVE",
      delta: -2,
      inventory_lot_id: "lot-1",
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payload).toEqual({
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      operation_type: "REMOVE",
      allocations: [{ inventory_lot_id: "lot-1", delta: -2 }],
      client_created_at: pending[0]?.payload.client_created_at,
    });
    expect(pending[0]?.payload.allocations[0]).not.toHaveProperty("expiration_date");
  });

  it("rejects insufficient stock and leaves lots unchanged", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(lot({ id: "lot-1", quantity: 1 }));

    const result = await removeInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 2,
      operation_id: "op-short",
    });

    expect(result).toEqual({ ok: false, code: "insufficient_stock" });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "lot-1")).toMatchObject({
      quantity: 1,
    });
    expect(await historyRows()).toHaveLength(0);
    expect(await outboxRows()).toHaveLength(0);
  });

  it("never persists a negative lot quantity", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(lot({ id: "lot-1", quantity: 1 }));

    await removeInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 5,
      inventory_lot_id: "lot-1",
      operation_id: "op-neg",
    });

    const lots = await inventoryRepository.listLots(HOUSEHOLD_A);
    expect(lots.every((row) => row.quantity >= 0)).toBe(true);
  });

  it("uses one operation_id and a null lot id when FEFO splits lots", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(
      lot({ id: "soon", quantity: 2, expiration_date: "2027-01-10" }),
    );
    await inventoryRepository.putLot(
      lot({ id: "later", quantity: 3, expiration_date: "2027-06-20" }),
    );

    const result = await removeInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 3,
      operation_id: "op-split",
    });

    expect(result.ok).toBe(true);
    const history = await historyRows();
    const pending = await outboxRows();
    expect(history).toHaveLength(1);
    expect(pending).toHaveLength(1);
    expect(history[0]?.operation_id).toBe("op-split");
    expect(pending[0]?.operation_id).toBe("op-split");
    expect(history[0]?.inventory_lot_id).toBeNull();
    expect(pending[0]?.payload.allocations).toEqual([
      { inventory_lot_id: "soon", delta: -2 },
      { inventory_lot_id: "later", delta: -1 },
    ]);
    expect(history[0]?.delta).toBe(-3);
  });

  it("rejects zero and negative quantities", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(lot({ id: "lot-1", quantity: 4 }));

    expect(
      await removeInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        location_id: LOCATION_A,
        quantity: 0,
        operation_id: "op-rm-zero",
      }),
    ).toEqual({ ok: false, code: "invalid_quantity" });

    expect(
      await removeInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        location_id: LOCATION_A,
        quantity: -2,
        operation_id: "op-rm-neg",
      }),
    ).toEqual({ ok: false, code: "invalid_quantity" });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "lot-1")).toMatchObject({
      quantity: 4,
    });
  });
});

describe("atomicity and isolation", () => {
  it("rolls back lots and history when outbox insertion fails", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(lot({ id: "lot-1", quantity: 4 }));

    const db = getHouseholdDb();
    db.pending_operations.hook("creating", () => {
      throw new Error("outbox fail");
    });

    const result = await removeInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 1,
      inventory_lot_id: "lot-1",
      operation_id: "op-outbox-fail",
    });

    expect(result).toEqual({ ok: false, code: "persistence_failure" });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "lot-1")).toMatchObject({
      quantity: 4,
    });
    expect(await historyRows()).toHaveLength(0);
    expect(await outboxRows()).toHaveLength(0);
  });

  it("rolls back an add when outbox insertion fails", async () => {
    await seedHousehold(HOUSEHOLD_A);

    const db = getHouseholdDb();
    db.pending_operations.hook("creating", () => {
      throw new Error("outbox fail");
    });

    const result = await addInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 2,
      operation_id: "op-add-outbox-fail",
    });

    expect(result).toEqual({ ok: false, code: "persistence_failure" });
    expect(
      await inventoryRepository.listLotsForProductAtLocation(
        HOUSEHOLD_A,
        PRODUCT_A,
        LOCATION_A,
      ),
    ).toEqual([]);
    expect(await historyRows()).toHaveLength(0);
    expect(await outboxRows()).toHaveLength(0);
  });

  it("leaves no outbox row when lot persistence fails", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot(lot({ id: "lot-1", quantity: 4 }));

    const db = getHouseholdDb();
    db.inventory_lots.hook("updating", () => {
      throw new Error("lot fail");
    });

    const result = await removeInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 1,
      inventory_lot_id: "lot-1",
      operation_id: "op-lot-fail",
    });

    expect(result).toEqual({ ok: false, code: "persistence_failure" });
    expect(await historyRows()).toHaveLength(0);
    expect(await outboxRows()).toHaveLength(0);
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "lot-1")).toMatchObject({
      quantity: 4,
    });
  });

  it("does not let household A mutate household B inventory", async () => {
    await seedBothHouseholds();
    await inventoryRepository.putLot(
      lot({
        id: "lot-b",
        household_id: HOUSEHOLD_B,
        product_id: PRODUCT_B,
        location_id: LOCATION_B,
        quantity: 6,
      }),
    );

    const result = await removeInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_B,
      location_id: LOCATION_B,
      quantity: 1,
      inventory_lot_id: "lot-b",
      operation_id: "op-iso",
    });

    expect(result.ok).toBe(false);
    expect(await inventoryRepository.getLotById(HOUSEHOLD_B, "lot-b")).toMatchObject({
      quantity: 6,
    });
  });

  it("rejects product, location, and lot household mismatches", async () => {
    await seedBothHouseholds();
    await inventoryRepository.putLot(
      lot({
        id: "lot-b",
        household_id: HOUSEHOLD_B,
        product_id: PRODUCT_B,
        location_id: LOCATION_B,
        quantity: 2,
      }),
    );

    expect(
      await addInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_B,
        location_id: LOCATION_A,
        quantity: 1,
        operation_id: "op-prod",
      }),
    ).toEqual({ ok: false, code: "invalid_product" });

    expect(
      await addInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        location_id: LOCATION_B,
        quantity: 1,
        operation_id: "op-loc",
      }),
    ).toEqual({ ok: false, code: "invalid_location" });

    expect(
      await removeInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        location_id: LOCATION_A,
        quantity: 1,
        inventory_lot_id: "lot-b",
        operation_id: "op-lot",
      }),
    ).toEqual({ ok: false, code: "invalid_lot" });
  });
});

describe("moveInventory", () => {
  async function seedMoveHousehold(): Promise<void> {
    await seedHousehold(HOUSEHOLD_A);
    await locationRepository.put(location(LOCATION_B, HOUSEHOLD_A));
  }

  it("moves stock, preserves expiration, and writes two command rows", async () => {
    await seedMoveHousehold();
    await inventoryRepository.putLot(
      lot({ id: "src-dated", quantity: 4, expiration_date: "2027-01-10" }),
    );

    const result = await moveInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      source_location_id: LOCATION_A,
      destination_location_id: LOCATION_B,
      quantity: 3,
      operation_id: "op-move-src",
      destination_operation_id: "op-move-dest",
      client_created_at: "2026-09-09T10:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.operation_id).toBe("op-move-src");
    expect(result.value.destination_operation_id).toBe("op-move-dest");
    expect(result.value.operation_id).not.toBe(result.value.destination_operation_id);

    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "src-dated")).toMatchObject({
      quantity: 1,
      expiration_date: "2027-01-10",
    });
    const destLots = await inventoryRepository.listLotsForProductAtLocation(
      HOUSEHOLD_A,
      PRODUCT_A,
      LOCATION_B,
    );
    expect(destLots).toHaveLength(1);
    expect(destLots[0]).toMatchObject({
      quantity: 3,
      expiration_date: "2027-01-10",
    });

    const history = await historyRows();
    const pending = await outboxRows();
    expect(history).toHaveLength(2);
    expect(pending).toHaveLength(2);
    expect(history.map((row) => row.operation_id).sort()).toEqual([
      "op-move-dest",
      "op-move-src",
    ]);
    expect(pending.map((row) => row.operation_id).sort()).toEqual([
      "op-move-dest",
      "op-move-src",
    ]);

    const removeRow = pending.find((row) => row.operation_id === "op-move-src");
    const addRow = pending.find((row) => row.operation_id === "op-move-dest");
    expect(removeRow?.payload).toEqual({
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      operation_type: "REMOVE",
      allocations: [{ inventory_lot_id: "src-dated", delta: -3 }],
      client_created_at: "2026-09-09T10:00:00.000Z",
    });
    expect(removeRow?.payload).not.toHaveProperty("quantity");
    expect(addRow?.payload.operation_type).toBe("ADD");
    expect(addRow?.payload.location_id).toBe(LOCATION_B);
    expect(addRow?.payload.allocations).toEqual([
      {
        inventory_lot_id: destLots[0]?.id,
        delta: 3,
        expiration_date: "2027-01-10",
      },
    ]);
    expect(addRow?.payload).not.toHaveProperty("quantity");
  });

  it("merges the destination lot when expiration matches and creates one when it differs", async () => {
    await seedMoveHousehold();
    await inventoryRepository.putLot(
      lot({ id: "src-soon", quantity: 2, expiration_date: "2027-01-10" }),
    );
    await inventoryRepository.putLot(
      lot({ id: "src-later", quantity: 2, expiration_date: "2027-06-20" }),
    );
    await inventoryRepository.putLot(
      lot({
        id: "dest-soon",
        location_id: LOCATION_B,
        quantity: 1,
        expiration_date: "2027-01-10",
      }),
    );

    const result = await moveInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      source_location_id: LOCATION_A,
      destination_location_id: LOCATION_B,
      quantity: 3,
      operation_id: "op-merge-src",
      destination_operation_id: "op-merge-dest",
    });

    expect(result.ok).toBe(true);
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "dest-soon")).toMatchObject({
      quantity: 3,
    });
    const destLots = await inventoryRepository.listLotsForProductAtLocation(
      HOUSEHOLD_A,
      PRODUCT_A,
      LOCATION_B,
    );
    expect(destLots).toHaveLength(2);
    expect(
      destLots.find((row) => row.expiration_date === "2027-06-20")?.quantity,
    ).toBe(1);
  });

  it("uses FEFO at the source and leaves undated lots last", async () => {
    await seedMoveHousehold();
    await inventoryRepository.putLot(
      lot({ id: "undated", quantity: 4, expiration_date: null }),
    );
    await inventoryRepository.putLot(
      lot({ id: "later", quantity: 3, expiration_date: "2027-06-20" }),
    );
    await inventoryRepository.putLot(
      lot({ id: "soon", quantity: 2, expiration_date: "2027-01-10" }),
    );

    const result = await moveInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      source_location_id: LOCATION_A,
      destination_location_id: LOCATION_B,
      quantity: 4,
      operation_id: "op-fefo-src",
      destination_operation_id: "op-fefo-dest",
    });

    expect(result.ok).toBe(true);
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "soon")).toMatchObject({
      quantity: 0,
    });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "later")).toMatchObject({
      quantity: 1,
    });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "undated")).toMatchObject({
      quantity: 4,
    });
  });

  it("rejects insufficient source stock and same-location moves", async () => {
    await seedMoveHousehold();
    await inventoryRepository.putLot(lot({ id: "src-1", quantity: 1 }));

    expect(
      await moveInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        source_location_id: LOCATION_A,
        destination_location_id: LOCATION_B,
        quantity: 2,
        operation_id: "op-short-src",
        destination_operation_id: "op-short-dest",
      }),
    ).toEqual({ ok: false, code: "insufficient_stock" });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "src-1")).toMatchObject({
      quantity: 1,
    });
    expect(await historyRows()).toHaveLength(0);
    expect(await outboxRows()).toHaveLength(0);

    expect(
      await moveInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        source_location_id: LOCATION_A,
        destination_location_id: LOCATION_A,
        quantity: 1,
        operation_id: "op-same-src",
        destination_operation_id: "op-same-dest",
      }),
    ).toEqual({ ok: false, code: "invalid_move" });
  });

  it("rejects wrong-household product and locations", async () => {
    await seedBothHouseholds();
    await locationRepository.put(location(LOCATION_A, HOUSEHOLD_B));

    expect(
      await moveInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_B,
        source_location_id: LOCATION_A,
        destination_location_id: LOCATION_B,
        quantity: 1,
        operation_id: "op-bad-prod-src",
        destination_operation_id: "op-bad-prod-dest",
      }),
    ).toEqual({ ok: false, code: "invalid_product" });

    expect(
      await moveInventory({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        source_location_id: LOCATION_B,
        destination_location_id: LOCATION_A,
        quantity: 1,
        operation_id: "op-bad-src",
        destination_operation_id: "op-bad-src-dest",
      }),
    ).toEqual({ ok: false, code: "invalid_location" });
  });

  it("rolls back both locations and outbox when the second outbox insert fails", async () => {
    await seedMoveHousehold();
    await inventoryRepository.putLot(lot({ id: "src-1", quantity: 4 }));

    const db = getHouseholdDb();
    let creates = 0;
    db.pending_operations.hook("creating", () => {
      creates += 1;
      if (creates === 2) {
        throw new Error("outbox fail");
      }
    });

    const result = await moveInventory({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      source_location_id: LOCATION_A,
      destination_location_id: LOCATION_B,
      quantity: 2,
      operation_id: "op-rb-src",
      destination_operation_id: "op-rb-dest",
    });

    expect(result).toEqual({ ok: false, code: "persistence_failure" });
    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "src-1")).toMatchObject({
      quantity: 4,
    });
    expect(
      await inventoryRepository.listLotsForProductAtLocation(
        HOUSEHOLD_A,
        PRODUCT_A,
        LOCATION_B,
      ),
    ).toEqual([]);
    expect(await historyRows()).toHaveLength(0);
    expect(await outboxRows()).toHaveLength(0);
  });
});

describe("source scan", () => {
  it("has no Next, React, Supabase, or fetch imports", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "mutate-inventory.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
    expect(source).not.toMatch(/@supabase/);
    expect(source).not.toMatch(/\bfetch\b/);
  });
});
