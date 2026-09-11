const MESSAGES: Record<string, string> = {
  invalid_name: "Enter a name (1–80 characters).",
  duplicate_name: "That name is already used.",
  category_in_use: "Reassign products in this category before archiving it.",
  invalid_category: "Choose an active category.",
  invalid_minimum_stock: "Minimum stock must be a whole number of 0 or more.",
  invalid_barcode: "Enter a barcode using 6 to 14 digits, or leave it blank.",
  duplicate_barcode: "That barcode is already used.",
  not_found: "That item is no longer available.",
  invalid_household: "Could not save. Try again.",
  persistence_failure: "Could not save. Try again.",
};

export function catalogErrorMessage(code: string): string {
  return MESSAGES[code] ?? "Could not save. Try again.";
}
