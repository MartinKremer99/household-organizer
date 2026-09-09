import { describe, expect, it } from "vitest";
import { validateMove } from "./move";

describe("validateMove", () => {
  it("preserves total stock as opposite deltas", () => {
    expect(
      validateMove({
        sourceLocationId: "cellar",
        destinationLocationId: "kitchen",
        quantity: 2,
        sourceQuantity: 5,
      }),
    ).toEqual({
      ok: true,
      value: { move_out_delta: -2, move_in_delta: 2 },
    });
  });

  it("rejects a move to the same location", () => {
    expect(
      validateMove({
        sourceLocationId: "kitchen",
        destinationLocationId: "kitchen",
        quantity: 1,
        sourceQuantity: 4,
      }),
    ).toEqual({ ok: false, code: "invalid_move" });
  });

  it("rejects insufficient source stock", () => {
    expect(
      validateMove({
        sourceLocationId: "cellar",
        destinationLocationId: "kitchen",
        quantity: 3,
        sourceQuantity: 2,
      }),
    ).toEqual({ ok: false, code: "insufficient_stock" });
  });
});
