import { validateBarcode } from "@/lib/domain/products/barcode";

export const OPEN_FOOD_FACTS_PRODUCT_URL =
  "https://world.openfoodfacts.org/api/v2/product";

export type BarcodeLookupResult =
  | { ok: true; name: string }
  | { ok: false; code: "not_found" | "offline" | "failed" | "invalid_barcode" };

export type LookupProductByBarcodeOptions = {
  fetch?: typeof fetch;
  online?: () => boolean;
};

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function usableName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.trim();
  return name.length > 0 ? name : null;
}

export async function lookupProductByBarcode(
  barcode: string,
  options?: LookupProductByBarcodeOptions,
): Promise<BarcodeLookupResult> {
  const parsed = validateBarcode(barcode);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_barcode" };
  }
  if (!parsed.value) {
    return { ok: false, code: "invalid_barcode" };
  }

  const online = options?.online ?? isOnline;
  if (!online()) {
    return { ok: false, code: "offline" };
  }

  const fetchFn = options?.fetch ?? fetch;
  try {
    const response = await fetchFn(
      `${OPEN_FOOD_FACTS_PRODUCT_URL}/${parsed.value}.json`,
    );
    if (!response.ok) {
      return { ok: false, code: "failed" };
    }
    const body = (await response.json()) as {
      status?: number | string;
      product?: { product_name?: unknown; product_name_en?: unknown };
    };
    const found = body.status === 1 || body.status === "1";
    const name = usableName(body.product?.product_name) ?? usableName(body.product?.product_name_en);
    if (!found || !name) {
      return { ok: false, code: "not_found" };
    }
    return { ok: true, name };
  } catch {
    return { ok: false, code: "failed" };
  }
}
