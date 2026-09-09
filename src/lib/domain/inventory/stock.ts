import type { InventoryLot } from "../../db/types";
import { err, ok, type DomainResult } from "../result";

export function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

export function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function applyDelta(
  current: number,
  delta: number,
): DomainResult<number> {
  if (!isInteger(current) || current < 0 || !isInteger(delta) || delta === 0) {
    return err("invalid_quantity");
  }

  const next = current + delta;
  if (next < 0) {
    return err("insufficient_stock");
  }

  return ok(next);
}

export function totalQuantity(
  lots: Pick<InventoryLot, "quantity">[],
): number {
  return lots.reduce((sum, lot) => sum + lot.quantity, 0);
}

export function quantityAtLocation(
  lots: Pick<InventoryLot, "quantity" | "location_id">[],
  locationId: string,
): number {
  return lots
    .filter((lot) => lot.location_id === locationId)
    .reduce((sum, lot) => sum + lot.quantity, 0);
}
