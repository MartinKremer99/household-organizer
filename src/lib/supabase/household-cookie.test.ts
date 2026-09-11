import { describe, expect, it } from "vitest";
import { householdCookieValue, householdIdFromCookie } from "./household-cookie";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const HOUSEHOLD = "22222222-2222-4222-8222-222222222222";

describe("householdIdFromCookie", () => {
  it("returns the household id when the cookie matches the live user", () => {
    expect(householdIdFromCookie(USER, householdCookieValue(USER, HOUSEHOLD))).toBe(
      HOUSEHOLD,
    );
  });

  it("ignores a cookie bound to another user", () => {
    expect(householdIdFromCookie(USER, householdCookieValue(OTHER, HOUSEHOLD))).toBeNull();
  });

  it("ignores missing or malformed values", () => {
    expect(householdIdFromCookie(USER, undefined)).toBeNull();
    expect(householdIdFromCookie(USER, HOUSEHOLD)).toBeNull();
    expect(householdIdFromCookie(USER, `${USER}:not-a-uuid`)).toBeNull();
  });
});
