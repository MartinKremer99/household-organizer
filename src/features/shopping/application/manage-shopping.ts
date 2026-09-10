import { householdRepository } from "@/features/household/repositories/household-repository";
import {
  persistInventoryAddLocal,
  planInventoryAdd,
  type InventoryMutationErrorCode,
} from "@/features/inventory/application/mutate-inventory";
import { purchasedStockRepository } from "@/features/inventory/repositories/purchased-stock-repository";
import { locationRepository } from "@/features/locations/repositories/location-repository";
import { productRepository } from "@/features/products/repositories/product-repository";
import { shoppingRepository } from "@/features/shopping/repositories/shopping-repository";
import { getHouseholdDb } from "@/lib/db";
import type {
  InventoryLot,
  PurchasedStock,
  ShoppingItem,
  ShoppingItemStatus,
} from "@/lib/db";
import type { DomainErrorCode } from "@/lib/domain/result";
import {
  validatePurchasedConsume,
  validatePutAway,
} from "@/lib/domain/shopping/purchased";
import {
  validateShoppingItem,
  validateShoppingTransition,
} from "@/lib/domain/shopping/shopping";
import { createOperationId } from "@/lib/sync/operation-id";
import { createPendingOperation, enqueue } from "@/lib/sync/outbox";

export type ShoppingErrorCode =
  | "invalid_quantity"
  | "invalid_shopping_item"
  | "invalid_transition"
  | "invalid_put_away"
  | "insufficient_stock"
  | "invalid_product"
  | "invalid_location"
  | "invalid_household"
  | "invalid_operation"
  | "persistence_failure";

export type ShoppingResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ShoppingErrorCode };

export type AddProductShoppingItemInput = {
  household_id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  id?: string;
};

export type AddFreeTextShoppingItemInput = {
  household_id: string;
  user_id: string;
  free_text: string;
  quantity: number;
  id?: string;
};

export type ChangeShoppingQuantityInput = {
  household_id: string;
  shopping_item_id: string;
  quantity: number;
};

export type MarkShoppingItemPurchasedInput = {
  household_id: string;
  user_id: string;
  shopping_item_id: string;
};

export type PutAwayPurchasedStockInput = {
  household_id: string;
  user_id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  expiration_date?: string | null;
  operation_id?: string;
  client_created_at?: string;
};

export type ConsumePurchasedStockInput = {
  household_id: string;
  product_id: string;
  quantity: number;
};

export type MarkFreeTextItemStoredInput = {
  household_id: string;
  shopping_item_id: string;
};

export type PurchasedStockView = {
  product_id: string;
  quantity: number;
};

export type PutAwaySuccess = {
  operation_id: string;
  remaining_quantity: number;
  lots: InventoryLot[];
};

export type ConsumeSuccess = {
  remaining_quantity: number;
};

function ok<T>(value: T): ShoppingResult<T> {
  return { ok: true, value };
}

function fail<T = never>(code: ShoppingErrorCode): ShoppingResult<T> {
  return { ok: false, code };
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function mapDomainCode(code: DomainErrorCode): ShoppingErrorCode {
  if (
    code === "invalid_quantity" ||
    code === "invalid_shopping_item" ||
    code === "invalid_transition" ||
    code === "invalid_put_away" ||
    code === "insufficient_stock"
  ) {
    return code;
  }

  return "invalid_shopping_item";
}

function mapInventoryCode(code: InventoryMutationErrorCode): ShoppingErrorCode {
  if (
    code === "invalid_quantity" ||
    code === "invalid_household" ||
    code === "invalid_product" ||
    code === "invalid_location" ||
    code === "invalid_operation" ||
    code === "persistence_failure"
  ) {
    return code;
  }

  if (code === "insufficient_stock") {
    return "insufficient_stock";
  }

  return "invalid_put_away";
}

async function requireHousehold(
  householdId: string,
): Promise<ShoppingErrorCode | null> {
  if (!isNonEmpty(householdId)) {
    return "invalid_household";
  }

  const household = await householdRepository.getById(householdId);
  return household ? null : "invalid_household";
}

function requireUserId(userId: string): ShoppingErrorCode | null {
  return isNonEmpty(userId) ? null : "invalid_operation";
}

function byCreatedAt<T extends { created_at: string }>(left: T, right: T): number {
  return left.created_at.localeCompare(right.created_at);
}

function poolQuantity(rows: PurchasedStock[]): number {
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

function toPurchasedViews(rows: PurchasedStock[]): PurchasedStockView[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + row.quantity);
  }
  return [...totals.entries()].map(([product_id, quantity]) => ({
    product_id,
    quantity,
  }));
}

async function replacePurchasedPool(
  householdId: string,
  productId: string,
  quantity: number,
  now: string,
): Promise<void> {
  const rows = (await purchasedStockRepository.listForProduct(householdId, productId))
    .slice()
    .sort(byCreatedAt);

  if (quantity === 0) {
    for (const row of rows) {
      await purchasedStockRepository.delete(householdId, row.id);
    }
    return;
  }

  const keeper = rows[0];
  if (!keeper) {
    await purchasedStockRepository.put({
      id: crypto.randomUUID(),
      household_id: householdId,
      product_id: productId,
      quantity,
      created_at: now,
      updated_at: now,
    });
    return;
  }

  await purchasedStockRepository.put({
    ...keeper,
    quantity,
    updated_at: now,
  });
  for (const extra of rows.slice(1)) {
    await purchasedStockRepository.delete(householdId, extra.id);
  }
}

async function purchasedProductItemsReadyToStore(
  householdId: string,
  productId: string,
): Promise<ShoppingResult<ShoppingItem[]>> {
  const items = (await shoppingRepository.listForProduct(householdId, productId))
    .filter((item) => item.status === "PURCHASED" && item.product_id !== null);

  for (const item of items) {
    const transition = validateShoppingTransition(item.status, "STORED");
    if (!transition.ok) {
      return fail(mapDomainCode(transition.code));
    }
  }

  return ok(items);
}

async function storePurchasedProductItems(
  items: ShoppingItem[],
  now: string,
): Promise<void> {
  for (const item of items) {
    await shoppingRepository.put({
      ...item,
      status: "STORED",
      updated_at: now,
    });
  }
}

async function runShoppingTransaction<T>(
  tables: Array<
    | "households"
    | "products"
    | "locations"
    | "shopping_items"
    | "purchased_stock"
    | "inventory_lots"
    | "inventory_operations"
    | "pending_operations"
  >,
  work: () => Promise<ShoppingResult<T>>,
): Promise<ShoppingResult<T>> {
  const db = getHouseholdDb();
  const stores = tables.map((name) => db[name]);

  try {
    return await db.transaction("rw", stores, work);
  } catch {
    return fail("persistence_failure");
  }
}

function newShoppingItem(input: {
  id?: string;
  household_id: string;
  user_id: string;
  product_id: string | null;
  free_text: string | null;
  quantity: number;
  now: string;
}): ShoppingItem {
  return {
    id: input.id ?? crypto.randomUUID(),
    household_id: input.household_id,
    product_id: input.product_id,
    free_text: input.free_text,
    quantity: input.quantity,
    status: "PENDING",
    created_by: input.user_id,
    created_at: input.now,
    updated_at: input.now,
    purchased_at: null,
    purchased_by: null,
  };
}

async function resolveExistingShoppingId(
  householdId: string,
  id: string | undefined,
): Promise<ShoppingResult<ShoppingItem | null>> {
  if (!id) {
    return ok(null);
  }

  const existing = await getHouseholdDb().shopping_items.get(id);
  if (!existing) {
    return ok(null);
  }
  if (existing.household_id !== householdId) {
    return fail("invalid_household");
  }
  return ok(existing);
}

export async function addProductShoppingItem(
  input: AddProductShoppingItemInput,
): Promise<ShoppingResult<ShoppingItem>> {
  const userError = requireUserId(input.user_id);
  if (userError) {
    return fail(userError);
  }

  const validated = validateShoppingItem({
    product_id: input.product_id,
    free_text: null,
    quantity: input.quantity,
  });
  if (!validated.ok) {
    return fail(mapDomainCode(validated.code));
  }

  return runShoppingTransaction(
    ["households", "products", "shopping_items"],
    async () => {
      const householdError = await requireHousehold(input.household_id);
      if (householdError) {
        return fail(householdError);
      }

      const existingId = await resolveExistingShoppingId(
        input.household_id,
        input.id,
      );
      if (!existingId.ok) {
        return existingId;
      }
      if (existingId.value) {
        return ok(existingId.value);
      }

      const product = await productRepository.getById(
        input.household_id,
        input.product_id,
      );
      if (!product || !product.is_active) {
        return fail("invalid_product");
      }

      const pending = (await shoppingRepository.listForProduct(
        input.household_id,
        input.product_id,
      ))
        .filter((item) => item.status === "PENDING")
        .sort(byCreatedAt);
      const earliest = pending[0];
      if (earliest) {
        const next: ShoppingItem = {
          ...earliest,
          quantity: earliest.quantity + validated.value.quantity,
          updated_at: new Date().toISOString(),
        };
        await shoppingRepository.put(next);
        return ok(next);
      }

      const now = new Date().toISOString();
      const record = newShoppingItem({
        id: input.id,
        household_id: input.household_id,
        user_id: input.user_id,
        product_id: validated.value.product_id,
        free_text: null,
        quantity: validated.value.quantity,
        now,
      });
      await shoppingRepository.put(record);
      return ok(record);
    },
  );
}

export async function addFreeTextShoppingItem(
  input: AddFreeTextShoppingItemInput,
): Promise<ShoppingResult<ShoppingItem>> {
  const userError = requireUserId(input.user_id);
  if (userError) {
    return fail(userError);
  }

  const validated = validateShoppingItem({
    product_id: null,
    free_text: input.free_text,
    quantity: input.quantity,
  });
  if (!validated.ok) {
    return fail(mapDomainCode(validated.code));
  }

  return runShoppingTransaction(["households", "shopping_items"], async () => {
    const householdError = await requireHousehold(input.household_id);
    if (householdError) {
      return fail(householdError);
    }

    const existingId = await resolveExistingShoppingId(
      input.household_id,
      input.id,
    );
    if (!existingId.ok) {
      return existingId;
    }
    if (existingId.value) {
      return ok(existingId.value);
    }

    const now = new Date().toISOString();
    const record = newShoppingItem({
      id: input.id,
      household_id: input.household_id,
      user_id: input.user_id,
      product_id: null,
      free_text: validated.value.free_text,
      quantity: validated.value.quantity,
      now,
    });
    await shoppingRepository.put(record);
    return ok(record);
  });
}

export async function changeShoppingQuantity(
  input: ChangeShoppingQuantityInput,
): Promise<ShoppingResult<ShoppingItem>> {
  return runShoppingTransaction(["households", "shopping_items"], async () => {
    const householdError = await requireHousehold(input.household_id);
    if (householdError) {
      return fail(householdError);
    }

    const item = await shoppingRepository.getById(
      input.household_id,
      input.shopping_item_id,
    );
    if (!item) {
      return fail("invalid_shopping_item");
    }
    if (item.status !== "PENDING") {
      return fail("invalid_transition");
    }

    const validated = validateShoppingItem({
      product_id: item.product_id,
      free_text: item.free_text,
      quantity: input.quantity,
    });
    if (!validated.ok) {
      return fail(mapDomainCode(validated.code));
    }

    const next: ShoppingItem = {
      ...item,
      quantity: validated.value.quantity,
      updated_at: new Date().toISOString(),
    };
    await shoppingRepository.put(next);
    return ok(next);
  });
}

export async function markShoppingItemPurchased(
  input: MarkShoppingItemPurchasedInput,
): Promise<ShoppingResult<ShoppingItem>> {
  const userError = requireUserId(input.user_id);
  if (userError) {
    return fail(userError);
  }

  return runShoppingTransaction(
    ["households", "products", "shopping_items", "purchased_stock"],
    async () => {
      const householdError = await requireHousehold(input.household_id);
      if (householdError) {
        return fail(householdError);
      }

      const item = await shoppingRepository.getById(
        input.household_id,
        input.shopping_item_id,
      );
      if (!item) {
        return fail("invalid_shopping_item");
      }

      const transition = validateShoppingTransition(item.status, "PURCHASED");
      if (!transition.ok) {
        return fail(mapDomainCode(transition.code));
      }

      const now = new Date().toISOString();
      const next: ShoppingItem = {
        ...item,
        status: "PURCHASED",
        purchased_at: now,
        purchased_by: input.user_id,
        updated_at: now,
      };
      await shoppingRepository.put(next);

      if (item.product_id) {
        const rows = await purchasedStockRepository.listForProduct(
          input.household_id,
          item.product_id,
        );
        await replacePurchasedPool(
          input.household_id,
          item.product_id,
          poolQuantity(rows) + item.quantity,
          now,
        );
      }

      return ok(next);
    },
  );
}

export async function putAwayPurchasedStock(
  input: PutAwayPurchasedStockInput,
): Promise<ShoppingResult<PutAwaySuccess>> {
  const userError = requireUserId(input.user_id);
  if (userError) {
    return fail(userError);
  }

  const operationId = input.operation_id ?? createOperationId();
  const candidateLotId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const clientCreatedAt = input.client_created_at ?? createdAt;

  return runShoppingTransaction(
    [
      "households",
      "products",
      "locations",
      "purchased_stock",
      "shopping_items",
      "inventory_lots",
      "inventory_operations",
      "pending_operations",
    ],
    async () => {
      const householdError = await requireHousehold(input.household_id);
      if (householdError) {
        return fail(householdError);
      }

      const product = await productRepository.getById(
        input.household_id,
        input.product_id,
      );
      if (!product) {
        return fail("invalid_product");
      }

      const location = await locationRepository.getById(
        input.household_id,
        input.location_id,
      );
      if (!location) {
        return fail("invalid_location");
      }

      const rows = await purchasedStockRepository.listForProduct(
        input.household_id,
        input.product_id,
      );
      const available = poolQuantity(rows);
      const putAway = validatePutAway({
        quantity: input.quantity,
        available,
        locationId: input.location_id,
        productId: input.product_id,
      });
      if (!putAway.ok) {
        return fail(mapDomainCode(putAway.code));
      }

      const toStore =
        putAway.value.remaining === 0
          ? await purchasedProductItemsReadyToStore(
              input.household_id,
              input.product_id,
            )
          : ok([] as ShoppingItem[]);
      if (!toStore.ok) {
        return toStore;
      }

      const addInput = {
        household_id: input.household_id,
        user_id: input.user_id,
        product_id: input.product_id,
        location_id: input.location_id,
        quantity: input.quantity,
        expiration_date: input.expiration_date,
      };
      const planned = await planInventoryAdd(
        addInput,
        operationId,
        candidateLotId,
        createdAt,
      );
      if (!planned.ok) {
        return fail(mapInventoryCode(planned.code));
      }

      await replacePurchasedPool(
        input.household_id,
        input.product_id,
        putAway.value.remaining,
        createdAt,
      );
      await persistInventoryAddLocal(
        addInput,
        operationId,
        createdAt,
        clientCreatedAt,
        planned.value,
      );
      await enqueue(
        createPendingOperation({
          household_id: input.household_id,
          operation_id: operationId,
          operation_type: "PUT_AWAY_PURCHASED_STOCK",
          payload: {
            product_id: input.product_id,
            location_id: input.location_id,
            quantity: input.quantity,
            expiration_date: input.expiration_date ?? null,
            client_created_at: clientCreatedAt,
          },
          created_at: createdAt,
        }),
      );

      await storePurchasedProductItems(toStore.value, createdAt);

      return ok({
        operation_id: operationId,
        remaining_quantity: putAway.value.remaining,
        lots: planned.value.lots,
      });
    },
  );
}

export async function consumePurchasedStock(
  input: ConsumePurchasedStockInput,
): Promise<ShoppingResult<ConsumeSuccess>> {
  return runShoppingTransaction(
    ["households", "products", "shopping_items", "purchased_stock"],
    async () => {
      const householdError = await requireHousehold(input.household_id);
      if (householdError) {
        return fail(householdError);
      }

      const product = await productRepository.getById(
        input.household_id,
        input.product_id,
      );
      if (!product) {
        return fail("invalid_product");
      }

      const rows = await purchasedStockRepository.listForProduct(
        input.household_id,
        input.product_id,
      );
      const consumed = validatePurchasedConsume({
        quantity: input.quantity,
        available: poolQuantity(rows),
      });
      if (!consumed.ok) {
        return fail(mapDomainCode(consumed.code));
      }

      const toStore =
        consumed.value.remaining === 0
          ? await purchasedProductItemsReadyToStore(
              input.household_id,
              input.product_id,
            )
          : ok([] as ShoppingItem[]);
      if (!toStore.ok) {
        return toStore;
      }

      const now = new Date().toISOString();
      await replacePurchasedPool(
        input.household_id,
        input.product_id,
        consumed.value.remaining,
        now,
      );
      await storePurchasedProductItems(toStore.value, now);

      return ok({ remaining_quantity: consumed.value.remaining });
    },
  );
}

export async function markFreeTextItemStored(
  input: MarkFreeTextItemStoredInput,
): Promise<ShoppingResult<ShoppingItem>> {
  return runShoppingTransaction(["households", "shopping_items"], async () => {
    const householdError = await requireHousehold(input.household_id);
    if (householdError) {
      return fail(householdError);
    }

    const item = await shoppingRepository.getById(
      input.household_id,
      input.shopping_item_id,
    );
    if (!item || item.free_text === null || item.product_id !== null) {
      return fail("invalid_shopping_item");
    }

    const transition = validateShoppingTransition(item.status, "STORED");
    if (!transition.ok) {
      return fail(mapDomainCode(transition.code));
    }

    const next: ShoppingItem = {
      ...item,
      status: "STORED",
      updated_at: new Date().toISOString(),
    };
    await shoppingRepository.put(next);
    return ok(next);
  });
}

export async function listShoppingItemsByStatus(
  householdId: string,
  status: ShoppingItemStatus,
): Promise<ShoppingItem[]> {
  if (!isNonEmpty(householdId)) {
    return [];
  }
  return shoppingRepository.listByStatus(householdId, status);
}

export async function listPendingShoppingItems(
  householdId: string,
): Promise<ShoppingItem[]> {
  return listShoppingItemsByStatus(householdId, "PENDING");
}

export async function listPurchasedShoppingItems(
  householdId: string,
): Promise<ShoppingItem[]> {
  return listShoppingItemsByStatus(householdId, "PURCHASED");
}

export async function listStoredShoppingItems(
  householdId: string,
): Promise<ShoppingItem[]> {
  return listShoppingItemsByStatus(householdId, "STORED");
}

export async function listPurchasedStock(
  householdId: string,
): Promise<ShoppingResult<PurchasedStockView[]>> {
  const householdError = await requireHousehold(householdId);
  if (householdError) {
    return fail(householdError);
  }

  const rows = await purchasedStockRepository.list(householdId);
  return ok(toPurchasedViews(rows));
}

export async function listPurchasedStockForProduct(
  householdId: string,
  productId: string,
): Promise<ShoppingResult<PurchasedStockView | null>> {
  const householdError = await requireHousehold(householdId);
  if (householdError) {
    return fail(householdError);
  }

  const rows = await purchasedStockRepository.listForProduct(
    householdId,
    productId,
  );
  const quantity = poolQuantity(rows);
  if (quantity === 0) {
    return ok(null);
  }
  return ok({ product_id: productId, quantity });
}
