export function isLowStock(current: number, minimum: number): boolean {
  if (minimum === 0) {
    return false;
  }

  return current < minimum;
}

export function suggestedShoppingQuantity(
  current: number,
  minimum: number,
): number {
  if (minimum === 0 || current >= minimum) {
    return 0;
  }

  return minimum - current;
}
