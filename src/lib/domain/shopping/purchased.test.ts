import { describe, expect, it } from "vitest";
import {
  remainingPurchased,
  validatePurchasedConsume,
  validatePurchasedQuantity,
  validatePutAway,
} from "./purchased";

describe("purchased stock", () => {
  it("accepts a positive quantity", () => {
    expect(validatePurchasedQuantity(4)).toEqual({ ok: true, value: 4 });
  });

  it("rejects zero or negative quantity", () => {
    expect(validatePurchasedQuantity(0)).toEqual({
      ok: false,
      code: "invalid_quantity",
    });
    expect(validatePurchasedQuantity(-2)).toEqual({
      ok: false,
      code: "invalid_quantity",
    });
  });

  it("calculates remaining purchased quantity", () => {
    expect(remainingPurchased(4, 1)).toEqual({ ok: true, value: 3 });
  });

  it("rejects put-away that exceeds available purchased quantity", () => {
    expect(
      validatePutAway({
        quantity: 5,
        available: 4,
        locationId: "kitchen",
        productId: "p-1",
      }),
    ).toEqual({ ok: false, code: "invalid_put_away" });
  });

  it("accepts a valid put-away", () => {
    expect(
      validatePutAway({
        quantity: 2,
        available: 4,
        locationId: "kitchen",
        productId: "p-1",
      }),
    ).toEqual({ ok: true, value: { quantity: 2, remaining: 2 } });
  });

  it("rejects consume-before-storage beyond available", () => {
    expect(validatePurchasedConsume({ quantity: 3, available: 2 })).toEqual({
      ok: false,
      code: "insufficient_stock",
    });
  });
});
