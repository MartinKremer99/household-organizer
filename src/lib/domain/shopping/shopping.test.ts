import { describe, expect, it } from "vitest";
import { validateShoppingItem, validateShoppingTransition } from "./shopping";

describe("validateShoppingTransition", () => {
  it("allows PENDING → PURCHASED", () => {
    expect(validateShoppingTransition("PENDING", "PURCHASED")).toMatchObject({
      ok: true,
    });
  });

  it("allows PURCHASED → STORED", () => {
    expect(validateShoppingTransition("PURCHASED", "STORED")).toMatchObject({
      ok: true,
    });
  });

  it("rejects backwards and skipped transitions", () => {
    expect(validateShoppingTransition("PURCHASED", "PENDING")).toEqual({
      ok: false,
      code: "invalid_transition",
    });
    expect(validateShoppingTransition("STORED", "PURCHASED")).toEqual({
      ok: false,
      code: "invalid_transition",
    });
    expect(validateShoppingTransition("PENDING", "STORED")).toEqual({
      ok: false,
      code: "invalid_transition",
    });
  });
});

describe("validateShoppingItem", () => {
  it("accepts a product item", () => {
    expect(
      validateShoppingItem({
        product_id: "p-1",
        free_text: null,
        quantity: 2,
      }),
    ).toMatchObject({ ok: true });
  });

  it("accepts a free-text item", () => {
    expect(
      validateShoppingItem({
        product_id: null,
        free_text: " Birthday candles ",
        quantity: 1,
      }),
    ).toEqual({
      ok: true,
      value: {
        product_id: null,
        free_text: "Birthday candles",
        quantity: 1,
      },
    });
  });

  it("rejects both product and free text", () => {
    expect(
      validateShoppingItem({
        product_id: "p-1",
        free_text: "candles",
        quantity: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_shopping_item" });
  });

  it("rejects neither product nor free text", () => {
    expect(
      validateShoppingItem({
        product_id: null,
        free_text: "  ",
        quantity: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_shopping_item" });
  });

  it("rejects zero or negative quantity", () => {
    expect(
      validateShoppingItem({
        product_id: "p-1",
        free_text: null,
        quantity: 0,
      }),
    ).toEqual({ ok: false, code: "invalid_quantity" });
    expect(
      validateShoppingItem({
        product_id: "p-1",
        free_text: null,
        quantity: -1,
      }),
    ).toEqual({ ok: false, code: "invalid_quantity" });
  });
});
