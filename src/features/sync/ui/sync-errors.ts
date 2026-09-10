const TRANSIENT = "Could not reach the server. Try again.";
const BUSINESS = "Could not apply a change. Check quantities and try again.";

const BUSINESS_CODES = new Set([
  "conflict",
  "insufficient_stock",
  "invalid_quantity",
  "invalid_put_away",
]);

export function syncStatusErrorMessage({
  kind,
  code,
}: {
  kind: "transient" | "business" | null;
  code: string | null;
}): string {
  if (kind === "business" || (code != null && BUSINESS_CODES.has(code))) {
    return BUSINESS;
  }
  return TRANSIENT;
}
