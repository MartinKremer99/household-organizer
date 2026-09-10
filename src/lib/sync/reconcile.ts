import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyHouseholdSnapshot,
  type HouseholdSnapshot,
  type PullHouseholdStateResult,
} from "@/features/household/application/hydrate-household";
import type {
  Category,
  Household,
  HouseholdMember,
  InventoryLot,
  InventoryOperation,
  Location,
  Product,
  PurchasedStock,
  ShoppingItem,
} from "@/lib/db";
import { createClient } from "@/lib/supabase/client";

export type ReconcileHouseholdResult =
  | { ok: true; server_cursor: string }
  | { ok: false; code: "not_authenticated" | "no_household" | "transient_error" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function asStringOrNull(value: unknown): string | null {
  return value == null ? null : asString(value);
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

function mapHousehold(row: Record<string, unknown>): Household {
  return {
    id: asString(row.id),
    name: asString(row.name),
    join_code: asString(row.join_code),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

function mapMembership(row: Record<string, unknown>): HouseholdMember {
  return {
    household_id: asString(row.household_id),
    user_id: asString(row.user_id),
    created_at: asString(row.created_at),
  };
}

function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: asString(row.id),
    household_id: asString(row.household_id),
    name: asString(row.name),
    is_active: asBoolean(row.is_active),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

function mapLocation(row: Record<string, unknown>): Location {
  return {
    id: asString(row.id),
    household_id: asString(row.household_id),
    name: asString(row.name),
    is_active: asBoolean(row.is_active),
    sort_order: asNumber(row.sort_order),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: asString(row.id),
    household_id: asString(row.household_id),
    name: asString(row.name),
    category_id: asString(row.category_id),
    minimum_stock: asNumber(row.minimum_stock),
    barcode: asStringOrNull(row.barcode),
    is_active: asBoolean(row.is_active),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

function mapLot(row: Record<string, unknown>): InventoryLot {
  return {
    id: asString(row.id),
    household_id: asString(row.household_id),
    product_id: asString(row.product_id),
    location_id: asString(row.location_id),
    quantity: asNumber(row.quantity),
    expiration_date: asStringOrNull(row.expiration_date),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

function mapOperation(row: Record<string, unknown>): InventoryOperation {
  return {
    id: asString(row.id),
    operation_id: asString(row.operation_id),
    household_id: asString(row.household_id),
    user_id: asString(row.user_id),
    product_id: asString(row.product_id),
    location_id: asString(row.location_id),
    inventory_lot_id: asStringOrNull(row.inventory_lot_id),
    delta: asNumber(row.delta),
    operation_type: asString(row.operation_type) as InventoryOperation["operation_type"],
    created_at: asString(row.created_at),
    client_created_at: asStringOrNull(row.client_created_at),
  };
}

function mapPurchased(row: Record<string, unknown>): PurchasedStock {
  return {
    id: asString(row.id),
    household_id: asString(row.household_id),
    product_id: asString(row.product_id),
    quantity: asNumber(row.quantity),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

function mapShopping(row: Record<string, unknown>): ShoppingItem {
  return {
    id: asString(row.id),
    household_id: asString(row.household_id),
    product_id: asStringOrNull(row.product_id),
    free_text: asStringOrNull(row.free_text),
    quantity: asNumber(row.quantity),
    status: asString(row.status) as ShoppingItem["status"],
    created_by: asString(row.created_by),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
    purchased_at: asStringOrNull(row.purchased_at),
    purchased_by: asStringOrNull(row.purchased_by),
  };
}

function mapRows<T>(value: unknown, map: (row: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map(map);
}

export function parsePullHouseholdState(data: unknown): PullHouseholdStateResult {
  if (!isRecord(data) || typeof data.ok !== "boolean") {
    return { ok: false, code: "transient_error" };
  }

  if (!data.ok) {
    if (data.code === "not_authenticated" || data.code === "no_household") {
      return { ok: false, code: data.code };
    }
    return { ok: false, code: "transient_error" };
  }

  if (!isRecord(data.household) || !isRecord(data.membership)) {
    return { ok: false, code: "transient_error" };
  }

  const snapshot: HouseholdSnapshot = {
    household: mapHousehold(data.household),
    membership: mapMembership(data.membership),
    categories: mapRows(data.categories, mapCategory),
    locations: mapRows(data.locations, mapLocation),
    products: mapRows(data.products, mapProduct),
    inventory_lots: mapRows(data.inventory_lots, mapLot),
    inventory_operations: mapRows(data.inventory_operations, mapOperation),
    purchased_stock: mapRows(data.purchased_stock, mapPurchased),
    shopping_items: mapRows(data.shopping_items, mapShopping),
    server_cursor: asString(data.server_cursor),
  };

  return { ok: true, snapshot };
}

export async function pullHouseholdState(
  supabase?: SupabaseClient,
): Promise<PullHouseholdStateResult> {
  const client = supabase ?? createClient();
  try {
    const { data, error } = await client.rpc("pull_household_state");
    if (error) {
      return { ok: false, code: "transient_error" };
    }
    return parsePullHouseholdState(data);
  } catch {
    return { ok: false, code: "transient_error" };
  }
}

export async function reconcileHousehold(
  _householdId: string,
  supabase?: SupabaseClient,
): Promise<ReconcileHouseholdResult> {
  const pulled = await pullHouseholdState(supabase);
  if (!pulled.ok) {
    return pulled;
  }

  await applyHouseholdSnapshot(pulled.snapshot);
  return { ok: true, server_cursor: pulled.snapshot.server_cursor };
}
