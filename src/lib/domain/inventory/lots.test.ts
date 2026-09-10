import { describe, expect, it } from "vitest";
import {
  applyLotDelta,
  calendarDaysUntil,
  isExpired,
  isExpiringWithin,
  selectLotsForConsumption,
  todayIsoDate,
} from "./lots";

describe("lots", () => {
  it("applies a delta to a specific lot", () => {
    expect(applyLotDelta({ quantity: 4 }, -1)).toEqual({ ok: true, value: 3 });
  });

  it("treats a null expiration as not expired", () => {
    expect(isExpired(null, "2026-09-09")).toBe(false);
  });

  it("treats expires-today as not expired", () => {
    expect(isExpired("2026-09-09", "2026-09-09")).toBe(false);
  });

  it("detects an expired lot", () => {
    expect(isExpired("2026-09-08", "2026-09-09")).toBe(true);
  });

  it("ignores null dates for upcoming expiration", () => {
    expect(isExpiringWithin(null, "2026-09-09", 3)).toBe(false);
  });

  it("does not treat already-expired lots as expiring soon", () => {
    expect(isExpiringWithin("2026-09-08", "2026-09-09", 3)).toBe(false);
  });

  it("detects lots expiring within N days", () => {
    expect(isExpiringWithin("2026-09-12", "2026-09-09", 3)).toBe(true);
    expect(isExpiringWithin("2026-09-13", "2026-09-09", 3)).toBe(false);
  });

  it("allocates FEFO: earliest dated lots first, undated last", () => {
    const result = selectLotsForConsumption(
      [
        { id: "undated", quantity: 4, expiration_date: null },
        { id: "later", quantity: 3, expiration_date: "2027-06-20" },
        { id: "soon", quantity: 2, expiration_date: "2027-01-10" },
      ],
      4,
    );

    expect(result).toEqual({
      ok: true,
      value: [
        { lot_id: "soon", quantity: 2 },
        { lot_id: "later", quantity: 2 },
      ],
    });
  });

  it("formats today as a local YYYY-MM-DD calendar date", () => {
    expect(todayIsoDate(new Date(2026, 8, 10, 23, 30))).toBe("2026-09-10");
  });

  it("counts calendar days between YYYY-MM-DD dates", () => {
    expect(calendarDaysUntil("2026-09-10", "2026-09-10")).toBe(0);
    expect(calendarDaysUntil("2026-09-10", "2026-09-11")).toBe(1);
    expect(calendarDaysUntil("2026-09-10", "2026-09-17")).toBe(7);
    expect(calendarDaysUntil("2026-09-30", "2026-10-01")).toBe(1);
    expect(calendarDaysUntil("2026-09-12", "2026-09-10")).toBe(-2);
  });

  it("rejects consumption beyond available stock", () => {
    expect(
      selectLotsForConsumption(
        [{ id: "a", quantity: 1, expiration_date: null }],
        2,
      ),
    ).toEqual({ ok: false, code: "insufficient_stock" });
  });
});
