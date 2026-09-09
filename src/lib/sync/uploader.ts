import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryAllocationPayload, OutboxPayload, PendingOperation } from "@/lib/db";
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
  allocations: OutboxPayload["allocations"] | undefined,
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
  if (!hasValidAllocations(operation.payload.allocations)) {
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
    const response = await supabase.rpc("apply_inventory_command", {
      p_operation_id: operation.operation_id,
      p_product_id: operation.payload.product_id,
      p_location_id: operation.payload.location_id,
      p_operation_type: operation.payload.operation_type,
      p_allocations: operation.payload.allocations,
      p_client_created_at:
        operation.payload.client_created_at ?? operation.created_at,
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
