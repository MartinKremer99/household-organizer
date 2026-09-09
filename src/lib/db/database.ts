import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  Category,
  Household,
  HouseholdMember,
  InventoryLot,
  InventoryOperation,
  Location,
  PendingOperation,
  Product,
  PurchasedStock,
  ShoppingItem,
  SyncMetadata,
} from "./types";

export const HOUSEHOLD_DB_NAME = "household-organizer";
export const HOUSEHOLD_DB_VERSION = 1;

export const HOUSEHOLD_DB_TABLES = [
  "households",
  "household_members",
  "categories",
  "locations",
  "products",
  "inventory_lots",
  "inventory_operations",
  "purchased_stock",
  "shopping_items",
  "pending_operations",
  "sync_metadata",
] as const;

// IndexedDB is not a security boundary. Every query must filter by the
// current household_id. [household_id+status] already prefixes household_id
// for shopping_items.

export class HouseholdDatabase extends Dexie {
  households!: EntityTable<Household, "id">;
  household_members!: Table<HouseholdMember, [string, string]>;
  categories!: EntityTable<Category, "id">;
  locations!: EntityTable<Location, "id">;
  products!: EntityTable<Product, "id">;
  inventory_lots!: EntityTable<InventoryLot, "id">;
  inventory_operations!: EntityTable<InventoryOperation, "id">;
  purchased_stock!: EntityTable<PurchasedStock, "id">;
  shopping_items!: EntityTable<ShoppingItem, "id">;
  pending_operations!: EntityTable<PendingOperation, "id">;
  sync_metadata!: EntityTable<SyncMetadata, "household_id">;

  constructor() {
    super(HOUSEHOLD_DB_NAME);
    this.version(HOUSEHOLD_DB_VERSION).stores({
      households: "id",
      household_members: "[household_id+user_id], household_id, user_id",
      categories: "id, household_id",
      locations: "id, household_id",
      products: "id, household_id, category_id",
      inventory_lots: "id, household_id, product_id, location_id, expiration_date",
      inventory_operations: "id, &operation_id, household_id, product_id",
      purchased_stock: "id, household_id, product_id",
      shopping_items: "id, product_id, [household_id+status]",
      pending_operations: "id, &operation_id, household_id, status",
      sync_metadata: "household_id",
    });
  }
}

let householdDb: HouseholdDatabase | undefined;

export function getHouseholdDb(): HouseholdDatabase {
  if (typeof indexedDB === "undefined") {
    throw new Error("Household database is browser-only");
  }

  if (!householdDb) {
    householdDb = new HouseholdDatabase();
  }

  return householdDb;
}

export async function resetHouseholdDbForTests(): Promise<void> {
  if (householdDb) {
    householdDb.close();
    householdDb = undefined;
  }

  await Dexie.delete(HOUSEHOLD_DB_NAME);
}
