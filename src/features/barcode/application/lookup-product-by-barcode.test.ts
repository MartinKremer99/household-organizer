import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupProductByBarcode } from "./lookup-product-by-barcode";

const BARCODE = "5449000000996";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupProductByBarcode", () => {
  it("returns a name from Open Food Facts without sending household data", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: { product_name: "Coca-Cola", product_name_en: "Coke" },
      }),
    });

    await expect(
      lookupProductByBarcode(BARCODE, { fetch: fetchFn, online: () => true }),
    ).resolves.toEqual({ ok: true, name: "Coca-Cola" });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe(
      `https://world.openfoodfacts.org/api/v2/product/${BARCODE}.json`,
    );
    expect(JSON.stringify({ url, init })).not.toMatch(/household/i);
    expect(JSON.stringify({ url, init })).not.toMatch(/user/i);
  });

  it("treats a missing name as not found", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, product: { product_name: "  " } }),
    });
    await expect(
      lookupProductByBarcode(BARCODE, { fetch: fetchFn, online: () => true }),
    ).resolves.toEqual({ ok: false, code: "not_found" });
  });

  it("does not fetch when offline", async () => {
    const fetchFn = vi.fn();
    await expect(
      lookupProductByBarcode(BARCODE, { fetch: fetchFn, online: () => false }),
    ).resolves.toEqual({ ok: false, code: "offline" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps network and HTTP failures", async () => {
    await expect(
      lookupProductByBarcode(BARCODE, {
        fetch: vi.fn().mockRejectedValue(new Error("offline")),
        online: () => true,
      }),
    ).resolves.toEqual({ ok: false, code: "failed" });

    await expect(
      lookupProductByBarcode(BARCODE, {
        fetch: vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
        online: () => true,
      }),
    ).resolves.toEqual({ ok: false, code: "failed" });
  });

  it("rejects an invalid barcode without fetching", async () => {
    const fetchFn = vi.fn();
    await expect(
      lookupProductByBarcode("abc", { fetch: fetchFn, online: () => true }),
    ).resolves.toEqual({ ok: false, code: "invalid_barcode" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
