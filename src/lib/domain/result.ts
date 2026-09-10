export type DomainErrorCode =
  | "invalid_quantity"
  | "insufficient_stock"
  | "invalid_operation"
  | "invalid_move"
  | "invalid_transition"
  | "invalid_shopping_item"
  | "invalid_put_away"
  | "invalid_name"
  | "invalid_minimum_stock";

export type DomainResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: DomainErrorCode };

export function ok<T>(value: T): DomainResult<T> {
  return { ok: true, value };
}

export function err<T = never>(code: DomainErrorCode): DomainResult<T> {
  return { ok: false, code };
}
