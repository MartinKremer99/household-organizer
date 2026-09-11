import { describe, expect, it } from "vitest";
import { catalogErrorMessage } from "./catalog-errors";

describe("catalogErrorMessage", () => {
  it("maps known codes and falls back for unknown ones", () => {
    expect(catalogErrorMessage("invalid_name")).toBe(
      "Enter a name (1–80 characters).",
    );
    expect(catalogErrorMessage("duplicate_name")).toBe("That name is already used.");
    expect(catalogErrorMessage("category_in_use")).toBe(
      "Reassign products in this category before archiving it.",
    );
    expect(catalogErrorMessage("invalid_category")).toBe(
      "Choose an active category.",
    );
    expect(catalogErrorMessage("invalid_minimum_stock")).toBe(
      "Minimum stock must be a whole number of 0 or more.",
    );
    expect(catalogErrorMessage("invalid_barcode")).toBe(
      "Enter a barcode using 6 to 14 digits, or leave it blank.",
    );
    expect(catalogErrorMessage("duplicate_barcode")).toBe(
      "That barcode is already used.",
    );
    expect(catalogErrorMessage("not_found")).toBe(
      "That item is no longer available.",
    );
    expect(catalogErrorMessage("invalid_household")).toBe(
      "Could not save. Try again.",
    );
    expect(catalogErrorMessage("persistence_failure")).toBe(
      "Could not save. Try again.",
    );
    expect(catalogErrorMessage("mystery")).toBe("Could not save. Try again.");
  });
});
