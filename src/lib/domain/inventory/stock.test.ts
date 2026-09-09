import { describe, expect, it } from "vitest";
import { applyDelta, quantityAtLocation, totalQuantity } from "./stock";

describe("applyDelta", () => {
  it("adds a positive quantity", () => {
    expect(applyDelta(2, 3)).toEqual({ ok: true, value: 5 });
  });

  it("removes sufficient stock", () => {
    expect(applyDelta(4, -1)).toEqual({ ok: true, value: 3 });
  });

  it("allows resulting stock of zero", () => {
    expect(applyDelta(2, -2)).toEqual({ ok: true, value: 0 });
  });

  it("rejects a zero delta", () => {
    expect(applyDelta(4, 0)).toEqual({ ok: false, code: "invalid_quantity" });
  });

  it("rejects a float delta", () => {
    expect(applyDelta(4, 1.5)).toEqual({ ok: false, code: "invalid_quantity" });
  });

  it("rejects negative current stock", () => {
    expect(applyDelta(-1, 1)).toEqual({ ok: false, code: "invalid_quantity" });
  });

  it("rejects insufficient stock", () => {
    expect(applyDelta(1, -2)).toEqual({
      ok: false,
      code: "insufficient_stock",
    });
  });
});

describe("stock totals", () => {
  const lots = [
    { quantity: 2, location_id: "kitchen" },
    { quantity: 3, location_id: "cellar" },
    { quantity: 1, location_id: "kitchen" },
  ];

  it("sums multiple lots for a product", () => {
    expect(totalQuantity(lots)).toBe(6);
  });

  it("sums quantity at a location", () => {
    expect(quantityAtLocation(lots, "kitchen")).toBe(3);
    expect(quantityAtLocation(lots, "bath")).toBe(0);
  });
});
