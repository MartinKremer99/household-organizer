const GENERIC = "Could not update shopping. Try again.";

const MESSAGES: Record<string, string> = {
  invalid_quantity: "Enter a whole number greater than 0.",
  invalid_shopping_item: "Could not update that item.",
  invalid_transition: "Could not update that item.",
  invalid_put_away: "Not enough purchased stock.",
  insufficient_stock: "Not enough purchased stock.",
  invalid_product: GENERIC,
  invalid_location: GENERIC,
  invalid_household: GENERIC,
  invalid_operation: GENERIC,
  persistence_failure: GENERIC,
};

export function shoppingErrorMessage(code: string): string {
  return MESSAGES[code] ?? GENERIC;
}
