import type { InventoryLot } from "../../db/types";
import { err, ok, type DomainResult } from "../result";
import { applyDelta, isPositiveInteger } from "./stock";

export type LotAllocation = {
  lot_id: string;
  quantity: number;
};

function utcDay(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  const next = new Date(utc);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calendarDaysUntil(today: string, date: string): number {
  return (utcDay(date) - utcDay(today)) / 86_400_000;
}

export function applyLotDelta(
  lot: Pick<InventoryLot, "quantity">,
  delta: number,
): DomainResult<number> {
  return applyDelta(lot.quantity, delta);
}

export function isExpired(
  expirationDate: string | null,
  today: string,
): boolean {
  return expirationDate !== null && expirationDate < today;
}

export function isExpiringWithin(
  expirationDate: string | null,
  today: string,
  withinDays: number,
): boolean {
  if (expirationDate === null || isExpired(expirationDate, today)) {
    return false;
  }

  return expirationDate <= addDays(today, withinDays);
}

function compareLotsForConsumption(
  a: Pick<InventoryLot, "expiration_date">,
  b: Pick<InventoryLot, "expiration_date">,
): number {
  if (a.expiration_date === null && b.expiration_date === null) {
    return 0;
  }
  if (a.expiration_date === null) {
    return 1;
  }
  if (b.expiration_date === null) {
    return -1;
  }
  return a.expiration_date.localeCompare(b.expiration_date);
}

export function selectLotsForConsumption(
  lots: Pick<InventoryLot, "id" | "quantity" | "expiration_date">[],
  quantity: number,
): DomainResult<LotAllocation[]> {
  if (!isPositiveInteger(quantity)) {
    return err("invalid_quantity");
  }

  const available = lots
    .filter((lot) => lot.quantity > 0)
    .slice()
    .sort(compareLotsForConsumption);

  const allocations: LotAllocation[] = [];
  let remaining = quantity;

  for (const lot of available) {
    if (remaining === 0) {
      break;
    }
    const take = Math.min(lot.quantity, remaining);
    allocations.push({ lot_id: lot.id, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) {
    return err("insufficient_stock");
  }

  return ok(allocations);
}
