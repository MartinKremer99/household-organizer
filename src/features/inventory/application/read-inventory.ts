import { categoryRepository } from "@/features/categories/repositories/category-repository";
import { inventoryRepository } from "@/features/inventory/repositories/inventory-repository";
import { locationRepository } from "@/features/locations/repositories/location-repository";
import { productRepository } from "@/features/products/repositories/product-repository";
import type { InventoryLot, Location, Product } from "@/lib/db";
import { isExpired, isExpiringWithin, todayIsoDate } from "@/lib/domain/inventory/lots";
import { quantityAtLocation, totalQuantity } from "@/lib/domain/inventory/stock";
import {
  isLowStock,
  suggestedShoppingQuantity,
} from "@/lib/domain/products/low-stock";

export type InventoryReadErrorCode = "invalid_household" | "not_found";

export type InventoryReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: InventoryReadErrorCode };

export type InventoryOverviewFilters = {
  query?: string;
  category_id?: string;
  location_id?: string;
};

export type InventoryLocationQuantity = {
  location_id: string;
  location_name: string | null;
  quantity: number;
};

export type InventoryOverviewItem = {
  product_id: string;
  product_name: string;
  category_id: string;
  category_name: string | null;
  minimum_stock: number;
  total_quantity: number;
  locations: InventoryLocationQuantity[];
};

export type InventoryLotView = {
  lot_id: string;
  location_id: string;
  location_name: string | null;
  quantity: number;
  expiration_date: string | null;
  expired: boolean;
};

export type ProductInventory = {
  product_id: string;
  product_name: string;
  category_id: string;
  category_name: string | null;
  minimum_stock: number;
  total_quantity: number;
  locations: InventoryLocationQuantity[];
  lots: InventoryLotView[];
};

export type ExpiringInventoryItem = {
  lot_id: string;
  product_id: string;
  product_name: string;
  location_id: string;
  location_name: string | null;
  quantity: number;
  expiration_date: string;
};

export type LowStockInventoryItem = {
  product_id: string;
  product_name: string;
  category_id: string;
  category_name: string | null;
  current_quantity: number;
  minimum_stock: number;
  suggested_quantity: number;
};

function isBlank(value: string): boolean {
  return value.trim() === "";
}

function byProductName(
  left: { product_name: string },
  right: { product_name: string },
): number {
  return left.product_name.toLowerCase().localeCompare(right.product_name.toLowerCase());
}

async function loadHouseholdCatalog(householdId: string) {
  const [products, lots, categories, locations] = await Promise.all([
    productRepository.list(householdId),
    inventoryRepository.listLots(householdId),
    categoryRepository.list(householdId, { includeInactive: true }),
    locationRepository.list(householdId, { includeInactive: true }),
  ]);

  return {
    products,
    lots,
    categoryNames: new Map(categories.map((row) => [row.id, row.name])),
    locationsById: new Map(locations.map((row) => [row.id, row])),
  };
}

function lotsForProduct(lots: InventoryLot[], productId: string): InventoryLot[] {
  return lots.filter((lot) => lot.product_id === productId);
}

function locationQuantities(
  lots: InventoryLot[],
  locationsById: Map<string, Location>,
): InventoryLocationQuantity[] {
  const locationIds = [...new Set(lots.map((lot) => lot.location_id))];
  return locationIds
    .map((locationId) => ({
      location_id: locationId,
      location_name: locationsById.get(locationId)?.name ?? null,
      quantity: quantityAtLocation(lots, locationId),
    }))
    .filter((row) => row.quantity > 0)
    .sort((left, right) => {
      const leftLocation = locationsById.get(left.location_id);
      const rightLocation = locationsById.get(right.location_id);
      if (!leftLocation && !rightLocation) {
        return left.location_id.localeCompare(right.location_id);
      }
      if (!leftLocation) {
        return 1;
      }
      if (!rightLocation) {
        return -1;
      }
      if (leftLocation.sort_order !== rightLocation.sort_order) {
        return leftLocation.sort_order - rightLocation.sort_order;
      }
      return leftLocation.name
        .toLowerCase()
        .localeCompare(rightLocation.name.toLowerCase());
    });
}

function overviewItem(
  product: Product,
  lots: InventoryLot[],
  categoryNames: Map<string, string>,
  locationsById: Map<string, Location>,
): InventoryOverviewItem {
  const productLots = lotsForProduct(lots, product.id);
  return {
    product_id: product.id,
    product_name: product.name,
    category_id: product.category_id,
    category_name: categoryNames.get(product.category_id) ?? null,
    minimum_stock: product.minimum_stock,
    total_quantity: totalQuantity(productLots),
    locations: locationQuantities(productLots, locationsById),
  };
}

function matchesFilters(
  product: Product,
  lots: InventoryLot[],
  filters?: InventoryOverviewFilters,
): boolean {
  const needle = filters?.query?.trim().toLowerCase() ?? "";
  if (needle && !product.name.toLowerCase().includes(needle)) {
    return false;
  }
  if (filters?.category_id && product.category_id !== filters.category_id) {
    return false;
  }
  if (
    filters?.location_id &&
    quantityAtLocation(lotsForProduct(lots, product.id), filters.location_id) <= 0
  ) {
    return false;
  }
  return true;
}

export async function listInventoryOverview(
  householdId: string,
  filters?: InventoryOverviewFilters,
): Promise<InventoryOverviewItem[]> {
  if (isBlank(householdId)) {
    return [];
  }

  const { products, lots, categoryNames, locationsById } =
    await loadHouseholdCatalog(householdId);

  return products
    .filter((product) => matchesFilters(product, lots, filters))
    .map((product) => overviewItem(product, lots, categoryNames, locationsById))
    .sort(byProductName);
}

export async function getProductInventory(
  householdId: string,
  productId: string,
  options?: { today?: string },
): Promise<InventoryReadResult<ProductInventory>> {
  if (isBlank(householdId)) {
    return { ok: false, code: "invalid_household" };
  }
  if (isBlank(productId)) {
    return { ok: false, code: "not_found" };
  }

  const product = await productRepository.getById(householdId, productId);
  if (!product || !product.is_active) {
    return { ok: false, code: "not_found" };
  }

  const [lots, categories, locations] = await Promise.all([
    inventoryRepository.listLotsForProduct(householdId, productId),
    categoryRepository.list(householdId, { includeInactive: true }),
    locationRepository.list(householdId, { includeInactive: true }),
  ]);
  const categoryNames = new Map(categories.map((row) => [row.id, row.name]));
  const locationsById = new Map(locations.map((row) => [row.id, row]));
  const visibleLots = lots.filter((row) => row.quantity > 0);

  const today = options?.today ?? todayIsoDate();
  const lotViews: InventoryLotView[] = visibleLots
    .map((row) => ({
      lot_id: row.id,
      location_id: row.location_id,
      location_name: locationsById.get(row.location_id)?.name ?? null,
      quantity: row.quantity,
      expiration_date: row.expiration_date,
      expired: isExpired(row.expiration_date, today),
    }))
    .sort((left, right) => {
      if (left.expiration_date === null && right.expiration_date === null) {
        return (left.location_name ?? "").localeCompare(right.location_name ?? "");
      }
      if (left.expiration_date === null) {
        return 1;
      }
      if (right.expiration_date === null) {
        return -1;
      }
      const byDate = left.expiration_date.localeCompare(right.expiration_date);
      if (byDate !== 0) {
        return byDate;
      }
      return (left.location_name ?? "").localeCompare(right.location_name ?? "");
    });

  return {
    ok: true,
    value: {
      product_id: product.id,
      product_name: product.name,
      category_id: product.category_id,
      category_name: categoryNames.get(product.category_id) ?? null,
      minimum_stock: product.minimum_stock,
      total_quantity: totalQuantity(lots),
      locations: locationQuantities(lots, locationsById),
      lots: lotViews,
    },
  };
}

export async function listExpiringInventory(
  householdId: string,
  options: { today: string; withinDays: number },
): Promise<ExpiringInventoryItem[]> {
  if (isBlank(householdId)) {
    return [];
  }

  const { products, lots, locationsById } = await loadHouseholdCatalog(householdId);
  const productNames = new Map(products.map((row) => [row.id, row.name]));
  const activeIds = new Set(products.map((row) => row.id));

  return lots
    .filter(
      (row) =>
        row.quantity > 0 &&
        activeIds.has(row.product_id) &&
        isExpiringWithin(row.expiration_date, options.today, options.withinDays),
    )
    .map((row) => ({
      lot_id: row.id,
      product_id: row.product_id,
      product_name: productNames.get(row.product_id) ?? "",
      location_id: row.location_id,
      location_name: locationsById.get(row.location_id)?.name ?? null,
      quantity: row.quantity,
      expiration_date: row.expiration_date as string,
    }))
    .sort((left, right) => {
      const byDate = left.expiration_date.localeCompare(right.expiration_date);
      if (byDate !== 0) {
        return byDate;
      }
      return byProductName(left, right);
    });
}

export async function listLowStockInventory(
  householdId: string,
): Promise<LowStockInventoryItem[]> {
  if (isBlank(householdId)) {
    return [];
  }

  const { products, lots, categoryNames } = await loadHouseholdCatalog(householdId);

  return products
    .map((product) => {
      const current_quantity = totalQuantity(lotsForProduct(lots, product.id));
      return {
        product_id: product.id,
        product_name: product.name,
        category_id: product.category_id,
        category_name: categoryNames.get(product.category_id) ?? null,
        current_quantity,
        minimum_stock: product.minimum_stock,
        suggested_quantity: suggestedShoppingQuantity(
          current_quantity,
          product.minimum_stock,
        ),
      };
    })
    .filter((row) => isLowStock(row.current_quantity, row.minimum_stock))
    .sort(byProductName);
}
