import { describe, expect, it } from "vitest";
import { expirationRelativeLabel } from "./expiration-copy";

describe("expirationRelativeLabel", () => {
  it("labels today, tomorrow, and later days", () => {
    expect(expirationRelativeLabel("2026-09-10", "2026-09-10")).toBe("today");
    expect(expirationRelativeLabel("2026-09-10", "2026-09-11")).toBe("tomorrow");
    expect(expirationRelativeLabel("2026-09-10", "2026-09-12")).toBe("in 2 days");
    expect(expirationRelativeLabel("2026-09-10", "2026-09-17")).toBe("in 7 days");
  });

  it("returns null for dates before today", () => {
    expect(expirationRelativeLabel("2026-09-10", "2026-09-09")).toBeNull();
  });
});
