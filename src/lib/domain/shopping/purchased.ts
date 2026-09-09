import { err, ok, type DomainResult } from "../result";
import { applyDelta, isPositiveInteger } from "../inventory/stock";

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function validatePurchasedQuantity(n: number): DomainResult<number> {
  if (!isPositiveInteger(n)) {
    return err("invalid_quantity");
  }

  return ok(n);
}

export function remainingPurchased(
  available: number,
  take: number,
): DomainResult<number> {
  return applyDelta(available, -take);
}

export function validatePutAway(input: {
  quantity: number;
  available: number;
  locationId: string;
  productId: string;
}): DomainResult<{ quantity: number; remaining: number }> {
  if (!isNonEmpty(input.locationId) || !isNonEmpty(input.productId)) {
    return err("invalid_put_away");
  }

  if (!isPositiveInteger(input.quantity)) {
    return err("invalid_quantity");
  }

  const remaining = remainingPurchased(input.available, input.quantity);
  if (!remaining.ok) {
    return remaining.code === "insufficient_stock"
      ? err("invalid_put_away")
      : remaining;
  }

  return ok({ quantity: input.quantity, remaining: remaining.value });
}

export function validatePurchasedConsume(input: {
  quantity: number;
  available: number;
}): DomainResult<{ quantity: number; remaining: number }> {
  if (!isPositiveInteger(input.quantity)) {
    return err("invalid_quantity");
  }

  const remaining = remainingPurchased(input.available, input.quantity);
  if (!remaining.ok) {
    return remaining;
  }

  return ok({ quantity: input.quantity, remaining: remaining.value });
}
