import type { ShoppingItemStatus } from "../../db/types";
import { err, ok, type DomainResult } from "../result";
import { isPositiveInteger } from "../inventory/stock";

export type ShoppingItemInput = {
  product_id: string | null;
  free_text: string | null;
  quantity: number;
};

const TRANSITIONS: ReadonlyArray<
  readonly [ShoppingItemStatus, ShoppingItemStatus]
> = [
  ["PENDING", "PURCHASED"],
  ["PURCHASED", "STORED"],
];

function hasProduct(productId: string | null): boolean {
  return productId !== null && productId.trim().length > 0;
}

function hasFreeText(freeText: string | null): boolean {
  return freeText !== null && freeText.trim().length > 0;
}

export function validateShoppingItem(
  input: ShoppingItemInput,
): DomainResult<ShoppingItemInput> {
  const product = hasProduct(input.product_id);
  const freeText = hasFreeText(input.free_text);

  if (product === freeText) {
    return err("invalid_shopping_item");
  }

  if (!isPositiveInteger(input.quantity)) {
    return err("invalid_quantity");
  }

  return ok({
    product_id: product ? input.product_id : null,
    free_text: freeText ? input.free_text!.trim() : null,
    quantity: input.quantity,
  });
}

export function validateShoppingTransition(
  from: ShoppingItemStatus,
  to: ShoppingItemStatus,
): DomainResult<{ from: ShoppingItemStatus; to: ShoppingItemStatus }> {
  const allowed = TRANSITIONS.some(
    ([start, end]) => start === from && end === to,
  );

  if (!allowed) {
    return err("invalid_transition");
  }

  return ok({ from, to });
}
