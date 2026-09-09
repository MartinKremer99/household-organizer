import { describe, expect, it } from "vitest";
import { validateInventoryOperation } from "./operations";

const base = {
  operation_id: "op-1",
  household_id: "hh-1",
  product_id: "p-1",
  location_id: "loc-1",
};

describe("validateInventoryOperation", () => {
  it("accepts ADD with a positive delta", () => {
    expect(
      validateInventoryOperation({ ...base, delta: 2, operation_type: "ADD" }),
    ).toMatchObject({ ok: true });
  });

  it("rejects REMOVE with a positive delta", () => {
    expect(
      validateInventoryOperation({
        ...base,
        delta: 1,
        operation_type: "REMOVE",
      }),
    ).toEqual({ ok: false, code: "invalid_operation" });
  });

  it("rejects a zero delta", () => {
    expect(
      validateInventoryOperation({
        ...base,
        delta: 0,
        operation_type: "ADJUST",
      }),
    ).toEqual({ ok: false, code: "invalid_quantity" });
  });

  it("rejects a missing product", () => {
    expect(
      validateInventoryOperation({
        ...base,
        product_id: "  ",
        delta: 1,
        operation_type: "ADD",
      }),
    ).toEqual({ ok: false, code: "invalid_operation" });
  });

  it("accepts ADJUST with a negative delta", () => {
    expect(
      validateInventoryOperation({
        ...base,
        delta: -1,
        operation_type: "ADJUST",
      }),
    ).toMatchObject({ ok: true });
  });
});
