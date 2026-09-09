import { describe, expect, it } from "vitest";
import { isLowStock, suggestedShoppingQuantity } from "./low-stock";

describe("low stock", () => {
  it("is low when current is below minimum", () => {
    expect(isLowStock(3, 5)).toBe(true);
  });

  it("is not low when current equals minimum", () => {
    expect(isLowStock(5, 5)).toBe(false);
  });

  it("is disabled when minimum is 0", () => {
    expect(isLowStock(0, 0)).toBe(false);
    expect(suggestedShoppingQuantity(0, 0)).toBe(0);
  });

  it("suggests the gap to minimum", () => {
    expect(suggestedShoppingQuantity(0, 5)).toBe(5);
    expect(suggestedShoppingQuantity(3, 5)).toBe(2);
    expect(suggestedShoppingQuantity(5, 5)).toBe(0);
    expect(suggestedShoppingQuantity(8, 5)).toBe(0);
  });
});
