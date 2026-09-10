import { err, ok, type DomainResult } from "../result";

export function validateMinimumStock(value: number): DomainResult<number> {
  if (!Number.isInteger(value) || value < 0) {
    return err("invalid_minimum_stock");
  }

  return ok(value);
}
