import { err, ok, type DomainResult } from "../result";

export function validateBarcode(
  value: string | null | undefined,
): DomainResult<string | null> {
  if (value == null) {
    return ok(null);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return ok(null);
  }

  if (!/^\d{6,14}$/.test(trimmed)) {
    return err("invalid_barcode");
  }

  return ok(trimmed);
}
