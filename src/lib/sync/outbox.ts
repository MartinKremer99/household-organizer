import { getHouseholdDb } from "@/lib/db";
import type {
  InventoryAllocationPayload,
  OutboxOperationType,
  OutboxPayload,
  PendingOperation,
  PutAwayPurchasedStockPayload,
} from "@/lib/db";
import { isInventoryCommandPayload, isPutAwayPurchasedStockPayload } from "@/lib/db";
import { pendingOperationRepository } from "./pending-operation-repository";

export type CreatePendingOperationInput = {
  household_id: string;
  operation_id: string;
  operation_type: OutboxOperationType;
  payload: OutboxPayload;
  created_at?: string;
};

export function createPendingOperation(
  input: CreatePendingOperationInput,
): PendingOperation {
  return {
    id: input.operation_id,
    household_id: input.household_id,
    operation_id: input.operation_id,
    operation_type: input.operation_type,
    payload: input.payload,
    created_at: input.created_at ?? new Date().toISOString(),
    retry_count: 0,
    last_attempt_at: null,
    last_error: null,
    status: "pending",
  };
}

function isPutAwayPayload(
  payload: OutboxPayload,
): payload is PutAwayPurchasedStockPayload {
  return isPutAwayPurchasedStockPayload(payload);
}

function allocationIdentity(allocation: InventoryAllocationPayload): string {
  const expiration =
    "expiration_date" in allocation
      ? JSON.stringify(allocation.expiration_date ?? null)
      : "ABSENT";
  const location = allocation.location_id ?? "ABSENT";
  return `${allocation.inventory_lot_id}|${allocation.delta}|${expiration}|${location}`;
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${key}:${canonicalize((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadsEqual(left: OutboxPayload, right: OutboxPayload): boolean {
  if (isPutAwayPayload(left) && isPutAwayPayload(right)) {
    return (
      left.product_id === right.product_id &&
      left.location_id === right.location_id &&
      left.quantity === right.quantity &&
      (left.expiration_date ?? null) === (right.expiration_date ?? null)
    );
  }

  if (isInventoryCommandPayload(left) && isInventoryCommandPayload(right)) {
    if (
      left.product_id !== right.product_id ||
      left.location_id !== right.location_id ||
      left.operation_type !== right.operation_type
    ) {
      return false;
    }

    const leftIds = left.allocations.map(allocationIdentity).sort();
    const rightIds = right.allocations.map(allocationIdentity).sort();
    if (leftIds.length !== rightIds.length) {
      return false;
    }

    return leftIds.every((value, index) => value === rightIds[index]);
  }

  return canonicalize(left) === canonicalize(right);
}

export async function enqueue(
  record: PendingOperation,
): Promise<PendingOperation> {
  const existing = await getHouseholdDb()
    .pending_operations.where("operation_id")
    .equals(record.operation_id)
    .first();

  if (existing) {
    if (
      existing.household_id === record.household_id &&
      payloadsEqual(existing.payload, record.payload)
    ) {
      return existing;
    }

    throw new Error("operation_id already exists");
  }

  await pendingOperationRepository.add(record);
  return record;
}

export async function listPending(
  householdId: string,
): Promise<PendingOperation[]> {
  return pendingOperationRepository.listPending(householdId);
}

export async function getByOperationId(
  householdId: string,
  operationId: string,
): Promise<PendingOperation | null> {
  return pendingOperationRepository.getByOperationId(householdId, operationId);
}

export async function markAttempt(
  householdId: string,
  operationId: string,
  attemptedAt: string,
): Promise<void> {
  const row = await pendingOperationRepository.getByOperationId(
    householdId,
    operationId,
  );

  if (!row) {
    return;
  }

  await pendingOperationRepository.put({
    ...row,
    retry_count: row.retry_count + 1,
    last_attempt_at: attemptedAt,
  });
}

export async function markFailed(
  householdId: string,
  operationId: string,
  error: string,
): Promise<void> {
  const row = await pendingOperationRepository.getByOperationId(
    householdId,
    operationId,
  );

  if (!row) {
    return;
  }

  await pendingOperationRepository.put({
    ...row,
    status: "failed",
    last_error: error,
  });
}

export async function complete(
  householdId: string,
  operationId: string,
): Promise<void> {
  await pendingOperationRepository.remove(householdId, operationId);
}
