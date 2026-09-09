import type { InventoryOperationType } from "../../db/types";
import { err, ok, type DomainResult } from "../result";
import { isInteger } from "./stock";

export type InventoryOperationInput = {
  operation_id: string;
  household_id: string;
  product_id: string;
  location_id: string;
  delta: number;
  operation_type: InventoryOperationType;
};

const POSITIVE_TYPES: ReadonlySet<InventoryOperationType> = new Set([
  "ADD",
  "MOVE_IN",
  "PUT_AWAY",
]);

const NEGATIVE_TYPES: ReadonlySet<InventoryOperationType> = new Set([
  "REMOVE",
  "MOVE_OUT",
]);

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function typeAllowsDelta(
  type: InventoryOperationType,
  delta: number,
): boolean {
  if (POSITIVE_TYPES.has(type)) {
    return delta > 0;
  }
  if (NEGATIVE_TYPES.has(type)) {
    return delta < 0;
  }
  return delta !== 0;
}

export function validateInventoryOperation(
  input: InventoryOperationInput,
): DomainResult<InventoryOperationInput> {
  if (
    !isNonEmpty(input.operation_id) ||
    !isNonEmpty(input.household_id) ||
    !isNonEmpty(input.product_id) ||
    !isNonEmpty(input.location_id)
  ) {
    return err("invalid_operation");
  }

  if (!isInteger(input.delta) || input.delta === 0) {
    return err("invalid_quantity");
  }

  if (!typeAllowsDelta(input.operation_type, input.delta)) {
    return err("invalid_operation");
  }

  return ok(input);
}
