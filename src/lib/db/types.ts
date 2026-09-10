export type InventoryOperationType =
  | "ADD"
  | "REMOVE"
  | "MOVE"
  | "MOVE_IN"
  | "MOVE_OUT"
  | "ADJUST"
  | "PUT_AWAY";

export type ShoppingItemStatus = "PENDING" | "PURCHASED" | "STORED";

export type PendingOperationStatus = "pending" | "failed";

export type Household = {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
  updated_at: string;
};

export type HouseholdMember = {
  household_id: string;
  user_id: string;
  created_at: string;
};

export type Category = {
  id: string;
  household_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Location = {
  id: string;
  household_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  household_id: string;
  name: string;
  category_id: string;
  minimum_stock: number;
  barcode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InventoryLot = {
  id: string;
  household_id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  expiration_date: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryOperation = {
  id: string;
  operation_id: string;
  household_id: string;
  user_id: string;
  product_id: string;
  location_id: string;
  inventory_lot_id: string | null;
  delta: number;
  operation_type: InventoryOperationType;
  created_at: string;
  client_created_at: string | null;
};

export type PurchasedStock = {
  id: string;
  household_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

export type ShoppingItem = {
  id: string;
  household_id: string;
  product_id: string | null;
  free_text: string | null;
  quantity: number;
  status: ShoppingItemStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  purchased_at: string | null;
  purchased_by: string | null;
};

export type InventoryAllocationPayload = {
  inventory_lot_id: string;
  delta: number;
  expiration_date?: string | null;
  location_id?: string;
};

export type InventoryCommandPayload = {
  product_id: string;
  location_id: string;
  operation_type: InventoryOperationType;
  allocations: InventoryAllocationPayload[];
  client_created_at?: string;
};

export type PutAwayPurchasedStockPayload = {
  product_id: string;
  location_id: string;
  quantity: number;
  expiration_date?: string | null;
  client_created_at?: string;
};

export type CatalogCommandPayload = {
  id: string;
  name?: string;
  category_id?: string;
  minimum_stock?: number;
  barcode?: string | null;
  client_created_at?: string;
};

export type ShoppingCommandPayload = {
  id?: string;
  product_id?: string | null;
  free_text?: string | null;
  quantity?: number;
  client_created_at?: string;
};

export type HouseholdCommandPayload = {
  name: string;
  client_created_at?: string;
};

export type OutboxPayload =
  | InventoryCommandPayload
  | PutAwayPurchasedStockPayload
  | CatalogCommandPayload
  | ShoppingCommandPayload
  | HouseholdCommandPayload;

export function isInventoryCommandPayload(
  payload: OutboxPayload,
): payload is InventoryCommandPayload {
  return "allocations" in payload && Array.isArray(payload.allocations);
}

export function isPutAwayPurchasedStockPayload(
  payload: OutboxPayload,
): payload is PutAwayPurchasedStockPayload {
  return (
    "quantity" in payload &&
    typeof payload.quantity === "number" &&
    "product_id" in payload &&
    "location_id" in payload &&
    !("allocations" in payload) &&
    !("id" in payload) &&
    !("name" in payload)
  );
}

export function isCatalogCommandPayload(
  payload: OutboxPayload,
): payload is CatalogCommandPayload {
  return "id" in payload && typeof payload.id === "string" && !("allocations" in payload);
}

export function isHouseholdCommandPayload(
  payload: OutboxPayload,
): payload is HouseholdCommandPayload {
  return (
    "name" in payload &&
    typeof payload.name === "string" &&
    !("id" in payload) &&
    !("allocations" in payload) &&
    !("product_id" in payload)
  );
}

export type CatalogOutboxOperationType =
  | "CREATE_CATEGORY"
  | "RENAME_CATEGORY"
  | "ARCHIVE_CATEGORY"
  | "CREATE_LOCATION"
  | "RENAME_LOCATION"
  | "ARCHIVE_LOCATION"
  | "CREATE_PRODUCT"
  | "RENAME_PRODUCT"
  | "CHANGE_PRODUCT_CATEGORY"
  | "CHANGE_PRODUCT_MINIMUM_STOCK"
  | "ARCHIVE_PRODUCT";

export type ShoppingOutboxOperationType =
  | "ADD_SHOPPING_ITEM"
  | "CHANGE_SHOPPING_QUANTITY"
  | "MARK_SHOPPING_PURCHASED"
  | "CONSUME_PURCHASED_STOCK"
  | "MARK_FREE_TEXT_STORED";

export type HouseholdOutboxOperationType = "RENAME_HOUSEHOLD";

export type OutboxOperationType =
  | "INVENTORY_DELTA"
  | "PUT_AWAY_PURCHASED_STOCK"
  | CatalogOutboxOperationType
  | ShoppingOutboxOperationType
  | HouseholdOutboxOperationType;

export type PendingOperation = {
  id: string;
  household_id: string;
  operation_id: string;
  operation_type: OutboxOperationType;
  payload: OutboxPayload;
  created_at: string;
  retry_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  status: PendingOperationStatus;
};

export type SyncLocalStatus = "never_synced" | "synced" | "pending" | "failed";

export type SyncErrorKind = "transient" | "business";

export type SyncMetadata = {
  household_id: string;
  last_sync_at: string | null;
  last_attempt_at: string | null;
  last_status: SyncLocalStatus;
  last_error_kind: SyncErrorKind | null;
  last_error_code: string | null;
  last_error_message: string | null;
  last_stop_reason: string | null;
  last_server_cursor: string | null;
  schema_version: number;
};
