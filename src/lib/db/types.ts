export type InventoryOperationType =
  | "ADD"
  | "REMOVE"
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
};

export type InventoryCommandPayload = {
  product_id: string;
  location_id: string;
  operation_type: InventoryOperationType;
  allocations: InventoryAllocationPayload[];
  client_created_at?: string;
};

export type OutboxPayload = InventoryCommandPayload;

export type OutboxOperationType = "INVENTORY_DELTA";

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

export type SyncMetadata = {
  household_id: string;
  last_sync_at: string | null;
  last_server_cursor: string | null;
  schema_version: number;
};
