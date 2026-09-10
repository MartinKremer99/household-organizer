const GENERIC = "Could not update inventory. Try again.";

const MESSAGES: Record<string, string> = {
  invalid_quantity: "Enter a whole number greater than 0.",
  insufficient_stock: "Not enough stock at that location.",
  invalid_move: "Choose two different locations.",
  invalid_lot: "That lot is no longer available.",
  invalid_location: GENERIC,
  invalid_product: GENERIC,
  invalid_household: GENERIC,
  not_found: GENERIC,
  invalid_operation: GENERIC,
  persistence_failure: GENERIC,
};

export function inventoryErrorMessage(code: string): string {
  return MESSAGES[code] ?? GENERIC;
}
