import {
  listExpiringInventory,
  listLowStockInventory,
  type ExpiringInventoryItem,
  type LowStockInventoryItem,
} from "@/features/inventory/application/read-inventory";
import { listActiveLocations } from "@/features/locations/application/manage-locations";
import { listActiveProducts } from "@/features/products/application/manage-products";
import {
  listPendingShoppingItems,
  listPurchasedStock,
} from "@/features/shopping/application/manage-shopping";
import { todayIsoDate } from "@/lib/domain/inventory/lots";

export type HomeDashboardApi = {
  listLowStockInventory: typeof listLowStockInventory;
  listExpiringInventory: typeof listExpiringInventory;
  listPendingShoppingItems: typeof listPendingShoppingItems;
  listPurchasedStock: typeof listPurchasedStock;
  listActiveLocations: typeof listActiveLocations;
  listActiveProducts: typeof listActiveProducts;
};

export type Section<T> = { ok: true; items: T } | { ok: false };

export type HomePurchasedItem = {
  product_id: string;
  product_name: string;
  quantity: number;
};

export type HomeShoppingItem = {
  id: string;
  name: string;
  quantity: number;
};

export type HomeLocationItem = {
  id: string;
  name: string;
};

export type HomeDashboardData = {
  lowStock: Section<LowStockInventoryItem[]>;
  expiring: Section<ExpiringInventoryItem[]>;
  purchased: Section<HomePurchasedItem[]>;
  shopping: Section<HomeShoppingItem[]>;
  locations: Section<HomeLocationItem[]>;
};

const defaults: HomeDashboardApi = {
  listLowStockInventory,
  listExpiringInventory,
  listPendingShoppingItems,
  listPurchasedStock,
  listActiveLocations,
  listActiveProducts,
};

const UNAVAILABLE = "Unavailable product";

function settledOk<T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === "fulfilled";
}

export async function loadHomeDashboard(
  householdId: string,
  options?: { api?: Partial<HomeDashboardApi>; today?: string },
): Promise<HomeDashboardData> {
  const api = { ...defaults, ...options?.api };
  const today = options?.today ?? todayIsoDate();

  const [
    lowStockResult,
    expiringResult,
    pendingResult,
    purchasedResult,
    locationsResult,
    productsResult,
  ] = await Promise.allSettled([
    api.listLowStockInventory(householdId),
    api.listExpiringInventory(householdId, { today, withinDays: 7 }),
    api.listPendingShoppingItems(householdId),
    api.listPurchasedStock(householdId),
    api.listActiveLocations(householdId),
    api.listActiveProducts(householdId),
  ]);

  const productNames = new Map<string, string>();
  if (settledOk(productsResult)) {
    for (const product of productsResult.value) {
      productNames.set(product.id, product.name);
    }
  }

  function productName(productId: string | null): string {
    if (!productId) {
      return UNAVAILABLE;
    }
    return productNames.get(productId) ?? UNAVAILABLE;
  }

  const purchased: Section<HomePurchasedItem[]> = (() => {
    if (!settledOk(purchasedResult) || !purchasedResult.value.ok) {
      return { ok: false };
    }
    return {
      ok: true,
      items: purchasedResult.value.value.map((row) => ({
        product_id: row.product_id,
        product_name: productName(row.product_id),
        quantity: row.quantity,
      })),
    };
  })();

  const shopping: Section<HomeShoppingItem[]> = settledOk(pendingResult)
    ? {
        ok: true,
        items: pendingResult.value.map((item) => ({
          id: item.id,
          name: item.free_text ?? productName(item.product_id),
          quantity: item.quantity,
        })),
      }
    : { ok: false };

  return {
    lowStock: settledOk(lowStockResult)
      ? { ok: true, items: lowStockResult.value }
      : { ok: false },
    expiring: settledOk(expiringResult)
      ? { ok: true, items: expiringResult.value }
      : { ok: false },
    purchased,
    shopping,
    locations: settledOk(locationsResult)
      ? {
          ok: true,
          items: locationsResult.value.map((row) => ({ id: row.id, name: row.name })),
        }
      : { ok: false },
  };
}
