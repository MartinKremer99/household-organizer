import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { categoryRepository } from "@/features/categories/repositories/category-repository";
import { locationRepository } from "@/features/locations/repositories/location-repository";
import { productRepository } from "@/features/products/repositories/product-repository";
import { getHouseholdDb, resetHouseholdDbForTests } from "@/lib/db";
import type { Category, InventoryLot, Location, Product } from "@/lib/db";
import { inventoryRepository } from "../repositories/inventory-repository";
import {
  getProductInventory,
  listExpiringInventory,
  listInventoryOverview,
  listLowStockInventory,
} from "./read-inventory";

const HOUSEHOLD_A = "household-a";
const HOUSEHOLD_B = "household-b";
const CAT_FOOD = "cat-food";
const CAT_CLEAN = "cat-clean";
const LOC_PANTRY = "loc-pantry";
const LOC_FRIDGE = "loc-fridge";
const PROD_MILK = "prod-milk";
const PROD_OATS = "prod-oats";
const PROD_SOAP = "prod-soap";
const PROD_WATER = "prod-water";
const STAMP = "2026-09-09T10:00:00.000Z";
const TODAY = "2026-09-10";

function category(id: string, name: string, householdId = HOUSEHOLD_A): Category {
  return {
    id,
    household_id: householdId,
    name,
    is_active: true,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function location(
  id: string,
  name: string,
  sort_order: number,
  householdId = HOUSEHOLD_A,
): Location {
  return {
    id,
    household_id: householdId,
    name,
    is_active: true,
    sort_order,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function product(
  overrides: Partial<Product> & Pick<Product, "id" | "name">,
): Product {
  return {
    household_id: HOUSEHOLD_A,
    category_id: CAT_FOOD,
    minimum_stock: 0,
    barcode: null,
    is_active: true,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

function lot(
  overrides: Partial<InventoryLot> & Pick<InventoryLot, "id">,
): InventoryLot {
  return {
    household_id: HOUSEHOLD_A,
    product_id: PROD_MILK,
    location_id: LOC_FRIDGE,
    quantity: 1,
    expiration_date: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

async function seedCatalog(): Promise<void> {
  await categoryRepository.put(category(CAT_FOOD, "Food"));
  await categoryRepository.put(category(CAT_CLEAN, "Cleaning"));
  await locationRepository.put(location(LOC_PANTRY, "Pantry", 0));
  await locationRepository.put(location(LOC_FRIDGE, "Fridge", 1));
  await productRepository.put(product({ id: PROD_MILK, name: "Milk", minimum_stock: 4 }));
  await productRepository.put(product({ id: PROD_OATS, name: "Oats", minimum_stock: 2 }));
  await productRepository.put(
    product({
      id: PROD_SOAP,
      name: "Soap",
      category_id: CAT_CLEAN,
      is_active: false,
      minimum_stock: 3,
    }),
  );
  await productRepository.put(
    product({ id: PROD_WATER, name: "Water", minimum_stock: 0 }),
  );
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("listInventoryOverview", () => {
  it("includes an active product with no lots at quantity 0", async () => {
    await seedCatalog();

    const rows = await listInventoryOverview(HOUSEHOLD_A);
    const water = rows.find((row) => row.product_id === PROD_WATER);

    expect(water).toEqual({
      product_id: PROD_WATER,
      product_name: "Water",
      category_id: CAT_FOOD,
      category_name: "Food",
      minimum_stock: 0,
      total_quantity: 0,
      locations: [],
    });
  });

  it("aggregates multiple lots in the same location and across locations", async () => {
    await seedCatalog();
    await inventoryRepository.putLot(
      lot({ id: "lot-milk-1", quantity: 2, expiration_date: "2026-09-20" }),
    );
    await inventoryRepository.putLot(
      lot({ id: "lot-milk-2", quantity: 3, expiration_date: "2026-10-01" }),
    );
    await inventoryRepository.putLot(
      lot({
        id: "lot-milk-pantry",
        location_id: LOC_PANTRY,
        quantity: 1,
      }),
    );

    const milk = (await listInventoryOverview(HOUSEHOLD_A)).find(
      (row) => row.product_id === PROD_MILK,
    );

    expect(milk?.total_quantity).toBe(6);
    expect(milk?.locations).toEqual([
      { location_id: LOC_PANTRY, location_name: "Pantry", quantity: 1 },
      { location_id: LOC_FRIDGE, location_name: "Fridge", quantity: 5 },
    ]);
  });

  it("returns category names and omits inactive products and other households", async () => {
    await seedCatalog();
    await categoryRepository.put(category("cat-b", "Other", HOUSEHOLD_B));
    await productRepository.put(
      product({
        id: "prod-b",
        name: "Hidden",
        household_id: HOUSEHOLD_B,
        category_id: "cat-b",
      }),
    );
    await inventoryRepository.putLot(
      lot({
        id: "lot-b",
        household_id: HOUSEHOLD_B,
        product_id: "prod-b",
        location_id: "loc-b",
        quantity: 9,
      }),
    );
    await inventoryRepository.putLot(
      lot({ id: "lot-soap", product_id: PROD_SOAP, quantity: 5 }),
    );

    const rows = await listInventoryOverview(HOUSEHOLD_A);

    expect(rows.map((row) => row.product_name)).toEqual(["Milk", "Oats", "Water"]);
    expect(rows.some((row) => row.product_id === PROD_SOAP)).toBe(false);
    expect(rows.some((row) => row.product_id === "prod-b")).toBe(false);
  });

  it("filters by name, category, and location without shrinking location breakdown", async () => {
    await seedCatalog();
    await inventoryRepository.putLot(lot({ id: "lot-milk-fridge", quantity: 2 }));
    await inventoryRepository.putLot(
      lot({ id: "lot-milk-pantry", location_id: LOC_PANTRY, quantity: 1 }),
    );
    await inventoryRepository.putLot(
      lot({ id: "lot-oats", product_id: PROD_OATS, location_id: LOC_PANTRY, quantity: 3 }),
    );

    const byName = await listInventoryOverview(HOUSEHOLD_A, { query: "ilk" });
    expect(byName.map((row) => row.product_id)).toEqual([PROD_MILK]);

    const byCategory = await listInventoryOverview(HOUSEHOLD_A, {
      category_id: CAT_FOOD,
    });
    expect(byCategory.map((row) => row.product_id)).toEqual([
      PROD_MILK,
      PROD_OATS,
      PROD_WATER,
    ]);

    const byLocation = await listInventoryOverview(HOUSEHOLD_A, {
      location_id: LOC_FRIDGE,
    });
    expect(byLocation.map((row) => row.product_id)).toEqual([PROD_MILK]);
    expect(byLocation[0]?.locations).toEqual([
      { location_id: LOC_PANTRY, location_name: "Pantry", quantity: 1 },
      { location_id: LOC_FRIDGE, location_name: "Fridge", quantity: 2 },
    ]);

    const combined = await listInventoryOverview(HOUSEHOLD_A, {
      query: "oat",
      category_id: CAT_FOOD,
      location_id: LOC_PANTRY,
    });
    expect(combined.map((row) => row.product_id)).toEqual([PROD_OATS]);

    expect(
      await listInventoryOverview(HOUSEHOLD_A, { query: "zzzz" }),
    ).toEqual([]);
    expect(await listInventoryOverview("   ")).toEqual([]);
  });
});

describe("getProductInventory", () => {
  it("returns product, locations, and lots with null expiration last", async () => {
    await seedCatalog();
    await inventoryRepository.putLot(
      lot({ id: "lot-undated", quantity: 1, expiration_date: null }),
    );
    await inventoryRepository.putLot(
      lot({
        id: "lot-later",
        quantity: 2,
        expiration_date: "2026-10-01",
        location_id: LOC_PANTRY,
      }),
    );
    await inventoryRepository.putLot(
      lot({ id: "lot-soon", quantity: 3, expiration_date: "2026-09-20" }),
    );
    await inventoryRepository.putLot(lot({ id: "lot-empty", quantity: 0 }));

    const result = await getProductInventory(HOUSEHOLD_A, PROD_MILK);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toMatchObject({
      product_id: PROD_MILK,
      product_name: "Milk",
      category_id: CAT_FOOD,
      category_name: "Food",
      minimum_stock: 4,
      total_quantity: 6,
    });
    expect(result.value.locations).toEqual([
      { location_id: LOC_PANTRY, location_name: "Pantry", quantity: 2 },
      { location_id: LOC_FRIDGE, location_name: "Fridge", quantity: 4 },
    ]);
    expect(result.value.lots.map((row) => row.lot_id)).toEqual([
      "lot-soon",
      "lot-later",
      "lot-undated",
    ]);
    expect(result.value.lots[0]?.expiration_date).toBe("2026-09-20");
  });

  it("returns zero stock for an active product with no lots", async () => {
    await seedCatalog();

    const result = await getProductInventory(HOUSEHOLD_A, PROD_WATER);
    expect(result).toEqual({
      ok: true,
      value: {
        product_id: PROD_WATER,
        product_name: "Water",
        category_id: CAT_FOOD,
        category_name: "Food",
        minimum_stock: 0,
        total_quantity: 0,
        locations: [],
        lots: [],
      },
    });
  });

  it("returns not_found for missing, inactive, or other-household products", async () => {
    await seedCatalog();
    await productRepository.put(
      product({
        id: "prod-b",
        name: "Hidden",
        household_id: HOUSEHOLD_B,
        category_id: CAT_FOOD,
      }),
    );

    expect(await getProductInventory(HOUSEHOLD_A, "missing")).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(await getProductInventory(HOUSEHOLD_A, PROD_SOAP)).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(await getProductInventory(HOUSEHOLD_A, "prod-b")).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(await getProductInventory(HOUSEHOLD_A, "   ")).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(await getProductInventory("   ", PROD_MILK)).toEqual({
      ok: false,
      code: "invalid_household",
    });
  });
});

describe("listExpiringInventory", () => {
  it("includes the requested window and drops expired, null, empty, and inactive lots", async () => {
    await seedCatalog();
    await inventoryRepository.putLot(
      lot({ id: "expired", quantity: 2, expiration_date: "2026-09-09" }),
    );
    await inventoryRepository.putLot(
      lot({ id: "undated", quantity: 2, expiration_date: null }),
    );
    await inventoryRepository.putLot(
      lot({ id: "today", quantity: 1, expiration_date: TODAY }),
    );
    await inventoryRepository.putLot(
      lot({ id: "edge", quantity: 1, expiration_date: "2026-09-17" }),
    );
    await inventoryRepository.putLot(
      lot({ id: "outside", quantity: 1, expiration_date: "2026-09-18" }),
    );
    await inventoryRepository.putLot(
      lot({ id: "zero", quantity: 0, expiration_date: "2026-09-12" }),
    );
    await inventoryRepository.putLot(
      lot({
        id: "inactive",
        product_id: PROD_SOAP,
        quantity: 4,
        expiration_date: "2026-09-12",
      }),
    );

    const rows = await listExpiringInventory(HOUSEHOLD_A, {
      today: TODAY,
      withinDays: 7,
    });

    expect(rows.map((row) => row.lot_id)).toEqual(["today", "edge"]);
    expect(rows[0]).toMatchObject({
      product_id: PROD_MILK,
      product_name: "Milk",
      location_id: LOC_FRIDGE,
      location_name: "Fridge",
      quantity: 1,
      expiration_date: TODAY,
    });
  });

  it("returns an empty list for a blank household", async () => {
    expect(
      await listExpiringInventory("  ", { today: TODAY, withinDays: 7 }),
    ).toEqual([]);
  });
});

describe("listLowStockInventory", () => {
  it("returns products below minimum with a suggested quantity and writes nothing", async () => {
    await seedCatalog();
    await inventoryRepository.putLot(lot({ id: "milk-stock", quantity: 1 }));
    await inventoryRepository.putLot(
      lot({ id: "oats-stock", product_id: PROD_OATS, quantity: 2 }),
    );
    await inventoryRepository.putLot(
      lot({ id: "soap-stock", product_id: PROD_SOAP, quantity: 0 }),
    );

    const before = await getHouseholdDb().shopping_items.count();
    const rows = await listLowStockInventory(HOUSEHOLD_A);
    const after = await getHouseholdDb().shopping_items.count();

    expect(rows).toEqual([
      {
        product_id: PROD_MILK,
        product_name: "Milk",
        category_id: CAT_FOOD,
        category_name: "Food",
        current_quantity: 1,
        minimum_stock: 4,
        suggested_quantity: 3,
      },
    ]);
    expect(before).toBe(0);
    expect(after).toBe(0);
  });

  it("returns an empty list for a blank household", async () => {
    expect(await listLowStockInventory("")).toEqual([]);
  });
});

describe("read-inventory source", () => {
  it("does not import React, Next, Supabase, sync, or Dexie helpers", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "read-inventory.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
    expect(source).not.toMatch(/@\/lib\/supabase/);
    expect(source).not.toMatch(/@\/lib\/sync/);
    expect(source).not.toMatch(/outbox/);
    expect(source).not.toMatch(/uploader/);
    expect(source).not.toMatch(/getHouseholdDb/);
  });
});
