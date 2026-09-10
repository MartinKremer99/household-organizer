import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import { householdRepository } from "@/features/household/repositories/household-repository";
import { inventoryRepository } from "@/features/inventory/repositories/inventory-repository";
import { purchasedStockRepository } from "@/features/inventory/repositories/purchased-stock-repository";
import { locationRepository } from "@/features/locations/repositories/location-repository";
import { productRepository } from "@/features/products/repositories/product-repository";
import { shoppingRepository } from "@/features/shopping/repositories/shopping-repository";
import { getHouseholdDb, resetHouseholdDbForTests } from "@/lib/db";
import type { Household, Location, Product, PurchasedStock } from "@/lib/db";
import {
  addFreeTextShoppingItem,
  addProductShoppingItem,
  changeShoppingQuantity,
  consumePurchasedStock,
  listPendingShoppingItems,
  listPurchasedShoppingItems,
  listPurchasedStock,
  listPurchasedStockForProduct,
  listStoredShoppingItems,
  markFreeTextItemStored,
  markShoppingItemPurchased,
  putAwayPurchasedStock,
} from "./manage-shopping";

const HOUSEHOLD_A = "household-a";
const HOUSEHOLD_B = "household-b";
const USER = "user-1";
const PRODUCT_A = "product-a";
const PRODUCT_B = "product-b";
const PRODUCT_INACTIVE = "product-inactive";
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

function product(
  id: string,
  householdId: string,
  overrides: Partial<Product> = {},
): Product {
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
    ...overrides,
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

async function seedHousehold(id: string): Promise<void> {
  await householdRepository.put(household(id));
  if (id === HOUSEHOLD_B) {
    await productRepository.put(product(PRODUCT_B, id));
    await locationRepository.put(location(LOCATION_B, id));
    return;
  }
  await productRepository.put(product(PRODUCT_A, id));
  await productRepository.put(
    product(PRODUCT_INACTIVE, id, { is_active: false }),
  );
  await locationRepository.put(location(LOCATION_A, id));
}

async function historyRows() {
  return getHouseholdDb().inventory_operations.toArray();
}

async function outboxRows() {
  return getHouseholdDb().pending_operations.toArray();
}

async function lotRows() {
  return getHouseholdDb().inventory_lots.toArray();
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("addProductShoppingItem", () => {
  it("adds a pending product item", async () => {
    await seedHousehold(HOUSEHOLD_A);

    const result = await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 3,
      id: "shop-1",
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({
      id: "shop-1",
      household_id: HOUSEHOLD_A,
      product_id: PRODUCT_A,
      free_text: null,
      quantity: 3,
      status: "PENDING",
      created_by: USER,
    });

    const pending = await listPendingShoppingItems(HOUSEHOLD_A);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe("shop-1");
  });

  it("rejects zero quantity, inactive products, and other-household products", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await seedHousehold(HOUSEHOLD_B);

    expect(
      await addProductShoppingItem({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        quantity: 0,
      }),
    ).toEqual({ ok: false, code: "invalid_quantity" });

    expect(
      await addProductShoppingItem({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_INACTIVE,
        quantity: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_product" });

    expect(
      await addProductShoppingItem({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_B,
        quantity: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_product" });

    expect(
      await addProductShoppingItem({
        household_id: "",
        user_id: USER,
        product_id: PRODUCT_A,
        quantity: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_household" });

    expect(
      await addProductShoppingItem({
        household_id: HOUSEHOLD_A,
        user_id: "",
        product_id: PRODUCT_A,
        quantity: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_operation" });
  });

  it("increments the earliest pending product row instead of inserting another", async () => {
    await seedHousehold(HOUSEHOLD_A);

    const first = await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 2,
      id: "shop-early",
    });
    expect(first.ok).toBe(true);

    const second = await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 3,
      id: "shop-ignored",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.value.id).toBe("shop-early");
    expect(second.value.quantity).toBe(5);

    const pending = await listPendingShoppingItems(HOUSEHOLD_A);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.quantity).toBe(5);
  });

  it("returns the existing row when the same id is retried", async () => {
    await seedHousehold(HOUSEHOLD_A);

    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 2,
      id: "shop-retry",
    });

    const retry = await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 9,
      id: "shop-retry",
    });

    expect(retry.ok).toBe(true);
    if (!retry.ok) {
      return;
    }
    expect(retry.value.quantity).toBe(2);

    const pending = await listPendingShoppingItems(HOUSEHOLD_A);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.quantity).toBe(2);
  });

  it("rejects a shopping id that already belongs to another household", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await seedHousehold(HOUSEHOLD_B);

    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 1,
      id: "shared-id",
    });

    expect(
      await addProductShoppingItem({
        household_id: HOUSEHOLD_B,
        user_id: USER,
        product_id: PRODUCT_B,
        quantity: 1,
        id: "shared-id",
      }),
    ).toEqual({ ok: false, code: "invalid_household" });
  });
});

describe("addFreeTextShoppingItem", () => {
  it("adds a trimmed free-text item and never writes purchased stock or lots", async () => {
    await seedHousehold(HOUSEHOLD_A);

    const result = await addFreeTextShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      free_text: "  Birthday candles  ",
      quantity: 2,
      id: "free-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({
      id: "free-1",
      product_id: null,
      free_text: "Birthday candles",
      quantity: 2,
      status: "PENDING",
    });

    expect(await purchasedStockRepository.list(HOUSEHOLD_A)).toEqual([]);
    expect(await lotRows()).toEqual([]);
  });

  it("does not merge two free-text items with the same text", async () => {
    await seedHousehold(HOUSEHOLD_A);

    await addFreeTextShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      free_text: "Candles",
      quantity: 1,
      id: "free-a",
    });
    await addFreeTextShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      free_text: "Candles",
      quantity: 2,
      id: "free-b",
    });

    const pending = await listPendingShoppingItems(HOUSEHOLD_A);
    expect(pending).toHaveLength(2);
  });

  it("rejects blank free text", async () => {
    await seedHousehold(HOUSEHOLD_A);

    expect(
      await addFreeTextShoppingItem({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        free_text: "   ",
        quantity: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_shopping_item" });
  });
});

describe("changeShoppingQuantity", () => {
  it("updates quantity only while the item is pending", async () => {
    await seedHousehold(HOUSEHOLD_A);

    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 2,
      id: "shop-qty",
    });

    const changed = await changeShoppingQuantity({
      household_id: HOUSEHOLD_A,
      shopping_item_id: "shop-qty",
      quantity: 5,
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      return;
    }
    expect(changed.value.quantity).toBe(5);
    expect(changed.value.status).toBe("PENDING");

    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "shop-qty",
    });

    expect(
      await changeShoppingQuantity({
        household_id: HOUSEHOLD_A,
        shopping_item_id: "shop-qty",
        quantity: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_transition" });
  });

  it("rejects missing items and invalid quantities", async () => {
    await seedHousehold(HOUSEHOLD_A);

    expect(
      await changeShoppingQuantity({
        household_id: HOUSEHOLD_A,
        shopping_item_id: "missing",
        quantity: 2,
      }),
    ).toEqual({ ok: false, code: "invalid_shopping_item" });

    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 2,
      id: "shop-qty-invalid",
    });

    expect(
      await changeShoppingQuantity({
        household_id: HOUSEHOLD_A,
        shopping_item_id: "shop-qty-invalid",
        quantity: 0,
      }),
    ).toEqual({ ok: false, code: "invalid_quantity" });
  });
});

describe("markShoppingItemPurchased", () => {
  it("moves a product item to purchased and creates purchased stock without inventory", async () => {
    await seedHousehold(HOUSEHOLD_A);

    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 4,
      id: "shop-buy",
    });

    const result = await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "shop-buy",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe("PURCHASED");
    expect(result.value.purchased_by).toBe(USER);
    expect(result.value.purchased_at).toEqual(expect.any(String));

    expect(await listPurchasedShoppingItems(HOUSEHOLD_A)).toHaveLength(1);
    expect(await listPurchasedStockForProduct(HOUSEHOLD_A, PRODUCT_A)).toEqual({
      ok: true,
      value: { product_id: PRODUCT_A, quantity: 4 },
    });
    expect(await lotRows()).toEqual([]);
    expect(await historyRows()).toEqual([]);
    expect(await outboxRows()).toEqual([]);
  });

  it("consolidates multiple purchases onto one purchased-stock pool", async () => {
    await seedHousehold(HOUSEHOLD_A);

    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 2,
      id: "shop-a",
    });
    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "shop-a",
    });

    await shoppingRepository.put({
      id: "shop-b",
      household_id: HOUSEHOLD_A,
      product_id: PRODUCT_A,
      free_text: null,
      quantity: 3,
      status: "PENDING",
      created_by: USER,
      created_at: "2026-09-09T11:00:00.000Z",
      updated_at: "2026-09-09T11:00:00.000Z",
      purchased_at: null,
      purchased_by: null,
    });

    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "shop-b",
    });

    const listed = await listPurchasedStock(HOUSEHOLD_A);
    expect(listed).toEqual({
      ok: true,
      value: [{ product_id: PRODUCT_A, quantity: 5 }],
    });
    expect(await purchasedStockRepository.listForProduct(HOUSEHOLD_A, PRODUCT_A)).toHaveLength(
      1,
    );
  });

  it("collapses leftover purchased-stock rows when incrementing the pool", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await purchasedStockRepository.put(
      stockRow("ps-1", PRODUCT_A, 2, "2026-09-09T10:00:00.000Z"),
    );
    await purchasedStockRepository.put(
      stockRow("ps-2", PRODUCT_A, 1, "2026-09-09T10:01:00.000Z"),
    );

    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 4,
      id: "shop-collapse",
    });
    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "shop-collapse",
    });

    const rows = await purchasedStockRepository.listForProduct(
      HOUSEHOLD_A,
      PRODUCT_A,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(7);
  });

  it("does not create purchased stock for free-text items", async () => {
    await seedHousehold(HOUSEHOLD_A);

    await addFreeTextShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      free_text: "Candles",
      quantity: 2,
      id: "free-buy",
    });
    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "free-buy",
    });

    expect(await purchasedStockRepository.list(HOUSEHOLD_A)).toEqual([]);
    expect(await lotRows()).toEqual([]);
    expect((await listPurchasedShoppingItems(HOUSEHOLD_A))[0]?.status).toBe(
      "PURCHASED",
    );
  });

  it("rejects a second purchase of the same item without increasing stock", async () => {
    await seedHousehold(HOUSEHOLD_A);

    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 2,
      id: "shop-once",
    });
    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "shop-once",
    });

    expect(
      await markShoppingItemPurchased({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        shopping_item_id: "shop-once",
      }),
    ).toEqual({ ok: false, code: "invalid_transition" });

    expect(await listPurchasedStockForProduct(HOUSEHOLD_A, PRODUCT_A)).toEqual({
      ok: true,
      value: { product_id: PRODUCT_A, quantity: 2 },
    });
  });

  it("rejects a missing shopping item", async () => {
    await seedHousehold(HOUSEHOLD_A);

    expect(
      await markShoppingItemPurchased({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        shopping_item_id: "missing",
      }),
    ).toEqual({ ok: false, code: "invalid_shopping_item" });
  });
});

describe("putAwayPurchasedStock", () => {
  async function purchasedProduct(quantity: number, id = "shop-put"): Promise<void> {
    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity,
      id,
    });
    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: id,
    });
  }

  it("puts the full purchased quantity into inventory and marks the item stored", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await purchasedProduct(4);

    const result = await putAwayPurchasedStock({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 4,
      operation_id: "op-put-full",
      client_created_at: "2026-09-10T10:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.operation_id).toBe("op-put-full");
    expect(result.value.remaining_quantity).toBe(0);
    expect(result.value.lots[0]?.quantity).toBe(4);

    expect(await listPurchasedStockForProduct(HOUSEHOLD_A, PRODUCT_A)).toEqual({
      ok: true,
      value: null,
    });
    expect(await listStoredShoppingItems(HOUSEHOLD_A)).toHaveLength(1);
    expect((await listPurchasedShoppingItems(HOUSEHOLD_A))).toHaveLength(0);
    expect(await purchasedStockRepository.list(HOUSEHOLD_A)).toEqual([]);
  });

  it("keeps items purchased after a partial put-away and records one ADD outbox command", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await purchasedProduct(4);

    const result = await putAwayPurchasedStock({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 1,
      expiration_date: "2027-01-10",
      operation_id: "op-put-partial",
      client_created_at: "2026-09-10T10:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.remaining_quantity).toBe(3);
    expect(result.value.lots[0]?.expiration_date).toBe("2027-01-10");

    expect(await listPurchasedShoppingItems(HOUSEHOLD_A)).toHaveLength(1);
    expect(await listStoredShoppingItems(HOUSEHOLD_A)).toHaveLength(0);
    expect(await listPurchasedStockForProduct(HOUSEHOLD_A, PRODUCT_A)).toEqual({
      ok: true,
      value: { product_id: PRODUCT_A, quantity: 3 },
    });

    const history = await historyRows();
    const pending = await outboxRows();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      operation_id: "op-put-partial",
      operation_type: "ADD",
      delta: 1,
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.operation_id).toBe("op-put-partial");
    expect(pending[0]?.operation_type).toBe("PUT_AWAY_PURCHASED_STOCK");
    expect(pending[0]?.payload).toEqual({
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 1,
      expiration_date: "2027-01-10",
      client_created_at: "2026-09-10T10:00:00.000Z",
    });
  });

  it("merges into an existing compatible lot", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await inventoryRepository.putLot({
      id: "lot-undated",
      household_id: HOUSEHOLD_A,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 2,
      expiration_date: null,
      created_at: "2026-09-09T10:00:00.000Z",
      updated_at: "2026-09-09T10:00:00.000Z",
    });
    await purchasedProduct(3);

    const result = await putAwayPurchasedStock({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 3,
      operation_id: "op-put-merge",
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

  it("rejects put-away that exceeds purchased stock or uses a foreign location", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await seedHousehold(HOUSEHOLD_B);
    await purchasedProduct(2);

    expect(
      await putAwayPurchasedStock({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        location_id: LOCATION_A,
        quantity: 5,
      }),
    ).toEqual({ ok: false, code: "invalid_put_away" });

    expect(
      await putAwayPurchasedStock({
        household_id: HOUSEHOLD_A,
        user_id: USER,
        product_id: PRODUCT_A,
        location_id: LOCATION_B,
        quantity: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_location" });

    expect(await lotRows()).toEqual([]);
    expect(await historyRows()).toEqual([]);
    expect(await outboxRows()).toEqual([]);
    expect(await listPurchasedStockForProduct(HOUSEHOLD_A, PRODUCT_A)).toEqual({
      ok: true,
      value: { product_id: PRODUCT_A, quantity: 2 },
    });
  });

  it("rolls back shopping, purchased stock, lots, history, and outbox when persist fails", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await purchasedProduct(4);

    const db = getHouseholdDb();
    db.pending_operations.hook("creating", () => {
      throw new Error("outbox fail");
    });

    const result = await putAwayPurchasedStock({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      location_id: LOCATION_A,
      quantity: 4,
      operation_id: "op-put-fail",
    });

    expect(result).toEqual({ ok: false, code: "persistence_failure" });
    expect((await listPurchasedShoppingItems(HOUSEHOLD_A))[0]?.status).toBe(
      "PURCHASED",
    );
    expect(await listPurchasedStockForProduct(HOUSEHOLD_A, PRODUCT_A)).toEqual({
      ok: true,
      value: { product_id: PRODUCT_A, quantity: 4 },
    });
    expect(await lotRows()).toEqual([]);
    expect(await historyRows()).toEqual([]);
    expect(await outboxRows()).toEqual([]);
  });
});

describe("consumePurchasedStock", () => {
  it("reduces the pool without creating inventory and stores items at zero", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 4,
      id: "shop-consume",
    });
    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "shop-consume",
    });

    const partial = await consumePurchasedStock({
      household_id: HOUSEHOLD_A,
      product_id: PRODUCT_A,
      quantity: 1,
    });
    expect(partial).toEqual({ ok: true, value: { remaining_quantity: 3 } });
    expect(await listPurchasedShoppingItems(HOUSEHOLD_A)).toHaveLength(1);
    expect(await lotRows()).toEqual([]);
    expect(await outboxRows()).toEqual([]);

    const done = await consumePurchasedStock({
      household_id: HOUSEHOLD_A,
      product_id: PRODUCT_A,
      quantity: 3,
    });
    expect(done).toEqual({ ok: true, value: { remaining_quantity: 0 } });
    expect(await listStoredShoppingItems(HOUSEHOLD_A)).toHaveLength(1);
    expect(await purchasedStockRepository.list(HOUSEHOLD_A)).toEqual([]);
  });

  it("rejects consume beyond the available pool", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 2,
      id: "shop-short",
    });
    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "shop-short",
    });

    expect(
      await consumePurchasedStock({
        household_id: HOUSEHOLD_A,
        product_id: PRODUCT_A,
        quantity: 3,
      }),
    ).toEqual({ ok: false, code: "insufficient_stock" });
  });
});

describe("markFreeTextItemStored", () => {
  it("stores a purchased free-text item without inventory", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await addFreeTextShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      free_text: "Candles",
      quantity: 1,
      id: "free-store",
    });
    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "free-store",
    });

    const stored = await markFreeTextItemStored({
      household_id: HOUSEHOLD_A,
      shopping_item_id: "free-store",
    });
    expect(stored.ok).toBe(true);
    if (!stored.ok) {
      return;
    }
    expect(stored.value.status).toBe("STORED");
    expect(await lotRows()).toEqual([]);
    expect(await purchasedStockRepository.list(HOUSEHOLD_A)).toEqual([]);
  });

  it("does not store a product item without put-away or consume", async () => {
    await seedHousehold(HOUSEHOLD_A);
    await addProductShoppingItem({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      product_id: PRODUCT_A,
      quantity: 1,
      id: "shop-no-skip",
    });
    await markShoppingItemPurchased({
      household_id: HOUSEHOLD_A,
      user_id: USER,
      shopping_item_id: "shop-no-skip",
    });

    expect(
      await markFreeTextItemStored({
        household_id: HOUSEHOLD_A,
        shopping_item_id: "shop-no-skip",
      }),
    ).toEqual({ ok: false, code: "invalid_shopping_item" });
    expect((await listPurchasedShoppingItems(HOUSEHOLD_A))[0]?.status).toBe(
      "PURCHASED",
    );
  });
});

function stockRow(
  id: string,
  productId: string,
  quantity: number,
  createdAt: string,
): PurchasedStock {
  return {
    id,
    household_id: HOUSEHOLD_A,
    product_id: productId,
    quantity,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

