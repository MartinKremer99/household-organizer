import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CatalogOutboxOperationType,
  InventoryAllocationPayload,
  OutboxOperationType,
  PendingOperation,
  PutAwayPurchasedStockPayload,
  ShoppingOutboxOperationType,
} from "@/lib/db";
import { isInventoryCommandPayload, isPutAwayPurchasedStockPayload } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { complete, listPending, markAttempt, markFailed } from "./outbox";

/**
 * Sequential household-scoped outbox upload.
 *
 * Continue after applied / already_applied.
 * Stop after the first conflict, business rejection, or transient error.
 * Failed rows stay failed (not retried by this function).
 * Transient rows stay pending for the next explicit call.
 * No timers, reconnect listeners, or background scheduling.
 */
export type UploadStopReason =
  | "no_session"
  | "no_household"
  | "empty"
  | "completed"
  | "transient_error"
  | "business_rejection"
  | "conflict";

export type UploadPendingResult = {
  stop_reason: UploadStopReason;
  uploaded_operation_ids: string[];
  stopped_operation_id: string | null;
  error: { code: string; message: string } | null;
};

export type UploadPendingOptions = {
  supabase?: SupabaseClient;
};

type ApplyInventoryCommandResult =
  | { ok: true; status?: string; operation_id?: string }
  | { ok: false; code: string };

function result(
  stop_reason: UploadStopReason,
  uploaded_operation_ids: string[] = [],
  stopped_operation_id: string | null = null,
  error: UploadPendingResult["error"] = null,
): UploadPendingResult {
  return { stop_reason, uploaded_operation_ids, stopped_operation_id, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApplyResult(value: unknown): value is ApplyInventoryCommandResult {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return true;
  }
  return typeof value.code === "string" && value.code.length > 0;
}

function httpStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }
  if (typeof error.status === "number") {
    return error.status;
  }
  if (isRecord(error.context) && typeof error.context.status === "number") {
    return error.context.status;
  }
  return null;
}

function hasValidAllocations(
  allocations: InventoryAllocationPayload[] | undefined,
): allocations is InventoryAllocationPayload[] {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return false;
  }

  return allocations.every(
    (allocation) =>
      isRecord(allocation) &&
      typeof allocation.inventory_lot_id === "string" &&
      allocation.inventory_lot_id.length > 0 &&
      typeof allocation.delta === "number" &&
      Number.isInteger(allocation.delta) &&
      allocation.delta !== 0,
  );
}

const CATALOG_TYPES = new Set<OutboxOperationType>([
  "CREATE_CATEGORY",
  "RENAME_CATEGORY",
  "ARCHIVE_CATEGORY",
  "CREATE_LOCATION",
  "RENAME_LOCATION",
  "ARCHIVE_LOCATION",
  "CREATE_PRODUCT",
  "RENAME_PRODUCT",
  "CHANGE_PRODUCT_CATEGORY",
  "CHANGE_PRODUCT_MINIMUM_STOCK",
  "ARCHIVE_PRODUCT",
]);

const SHOPPING_TYPES = new Set<OutboxOperationType>([
  "ADD_SHOPPING_ITEM",
  "CHANGE_SHOPPING_QUANTITY",
  "MARK_SHOPPING_PURCHASED",
  "CONSUME_PURCHASED_STOCK",
  "MARK_FREE_TEXT_STORED",
]);

function isCatalogType(
  type: OutboxOperationType,
): type is CatalogOutboxOperationType {
  return CATALOG_TYPES.has(type);
}

function isShoppingType(
  type: OutboxOperationType,
): type is ShoppingOutboxOperationType {
  return SHOPPING_TYPES.has(type);
}

function isValidPutAwayPayload(
  payload: PendingOperation["payload"],
): payload is PutAwayPurchasedStockPayload {
  return (
    isPutAwayPurchasedStockPayload(payload) &&
    Number.isInteger(payload.quantity) &&
    payload.quantity > 0 &&
    payload.product_id.trim().length > 0 &&
    payload.location_id.trim().length > 0
  );
}

export async function uploadPendingOperations(
  householdId: string,
  options?: UploadPendingOptions,
): Promise<UploadPendingResult> {
  const supabase = options?.supabase ?? createClient();
  const sessionResult = await supabase.auth.getSession();
  if (!sessionResult.data.session) {
    return result("no_session");
  }

  if (householdId.trim() === "") {
    return result("no_household");
  }

  const pending = await listPending(householdId);
  if (pending.length === 0) {
    return result("empty");
  }

  const uploaded: string[] = [];

  for (const operation of pending) {
    const outcome = await uploadOne(supabase, householdId, operation);
    if (outcome.kind === "uploaded") {
      uploaded.push(operation.operation_id);
      continue;
    }

    return result(outcome.stop_reason, uploaded, operation.operation_id, outcome.error);
  }

  return result("completed", uploaded);
}

async function uploadOne(
  supabase: SupabaseClient,
  householdId: string,
  operation: PendingOperation,
): Promise<
  | { kind: "uploaded" }
  | {
      kind: "stop";
      stop_reason: Exclude<UploadStopReason, "no_session" | "no_household" | "empty" | "completed">;
      error: UploadPendingResult["error"];
    }
> {
  if (operation.operation_type === "PUT_AWAY_PURCHASED_STOCK") {
    if (!isValidPutAwayPayload(operation.payload)) {
      await markFailed(householdId, operation.operation_id, "invalid_operation");
      return {
        kind: "stop",
        stop_reason: "business_rejection",
        error: { code: "invalid_operation", message: "put-away payload is invalid" },
      };
    }
  } else if (isCatalogType(operation.operation_type)) {
    if (!("id" in operation.payload) || typeof operation.payload.id !== "string") {
      await markFailed(householdId, operation.operation_id, "invalid_operation");
      return {
        kind: "stop",
        stop_reason: "business_rejection",
        error: { code: "invalid_operation", message: "catalog payload is invalid" },
      };
    }
  } else if (isShoppingType(operation.operation_type)) {
    if (!operation.payload || typeof operation.payload !== "object") {
      await markFailed(householdId, operation.operation_id, "invalid_operation");
      return {
        kind: "stop",
        stop_reason: "business_rejection",
        error: { code: "invalid_operation", message: "shopping payload is invalid" },
      };
    }
  } else if (
    !isInventoryCommandPayload(operation.payload) ||
    !hasValidAllocations(operation.payload.allocations)
  ) {
    await markFailed(householdId, operation.operation_id, "invalid_operation");
    return {
      kind: "stop",
      stop_reason: "business_rejection",
      error: { code: "invalid_operation", message: "allocations are missing or invalid" },
    };
  }

  await markAttempt(householdId, operation.operation_id, new Date().toISOString());

  let data: unknown;
  let error: unknown;
  try {
    const clientCreatedAt =
      "client_created_at" in operation.payload &&
      typeof operation.payload.client_created_at === "string"
        ? operation.payload.client_created_at
        : operation.created_at;
    const response =
      operation.operation_type === "PUT_AWAY_PURCHASED_STOCK" &&
      isValidPutAwayPayload(operation.payload)
        ? await supabase.rpc("put_away_purchased_stock", {
            p_operation_id: operation.operation_id,
            p_product_id: operation.payload.product_id,
            p_location_id: operation.payload.location_id,
            p_quantity: operation.payload.quantity,
            p_expiration_date: operation.payload.expiration_date ?? null,
            p_client_created_at: clientCreatedAt,
          })
        : isCatalogType(operation.operation_type)
          ? await supabase.rpc("apply_catalog_command", {
              p_operation_id: operation.operation_id,
              p_operation_type: operation.operation_type,
              p_payload: operation.payload,
              p_client_created_at: clientCreatedAt,
            })
          : isShoppingType(operation.operation_type)
            ? await supabase.rpc("apply_shopping_command", {
                p_operation_id: operation.operation_id,
                p_operation_type: operation.operation_type,
                p_payload: operation.payload,
                p_client_created_at: clientCreatedAt,
              })
        : isInventoryCommandPayload(operation.payload)
          ? await supabase.rpc("apply_inventory_command", {
              p_operation_id: operation.operation_id,
              p_product_id: operation.payload.product_id,
              p_location_id: operation.payload.location_id,
              p_operation_type: operation.payload.operation_type,
              p_allocations: operation.payload.allocations,
              p_client_created_at: clientCreatedAt,
            })
          : await supabase.rpc("apply_inventory_command", {
              p_operation_id: operation.operation_id,
              p_product_id: "",
              p_location_id: "",
              p_operation_type: "ADD",
              p_allocations: [],
              p_client_created_at: clientCreatedAt,
            });
    data = response.data;
    error = response.error;
  } catch (thrown) {
    return {
      kind: "stop",
      stop_reason: "transient_error",
      error: {
        code: "transient_error",
        message: thrown instanceof Error ? thrown.message : "request failed",
      },
    };
  }

  if (isApplyResult(data)) {
    if (data.ok) {
      await complete(householdId, operation.operation_id);
      return { kind: "uploaded" };
    }

    if (data.code === "conflict") {
      await markFailed(householdId, operation.operation_id, data.code);
      return {
        kind: "stop",
        stop_reason: "conflict",
        error: { code: data.code, message: data.code },
      };
    }

    await markFailed(householdId, operation.operation_id, data.code);
    return {
      kind: "stop",
      stop_reason: "business_rejection",
      error: { code: data.code, message: data.code },
    };
  }

  const status = httpStatus(error);
  const message =
    isRecord(error) && typeof error.message === "string"
      ? error.message
      : "request failed";

  if (status === 401 || status === 403) {
    return {
      kind: "stop",
      stop_reason: "transient_error",
      error: { code: "transient_error", message },
    };
  }

  return {
    kind: "stop",
    stop_reason: "transient_error",
    error: { code: "transient_error", message },
  };
}
