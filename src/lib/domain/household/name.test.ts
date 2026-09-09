import { describe, expect, it } from "vitest";
import { validateHouseholdName } from "./name";

describe("validateHouseholdName", () => {
  it("trims a valid name", () => {
    expect(validateHouseholdName("  Home  ")).toEqual({
      ok: true,
      value: "Home",
    });
  });

  it("rejects an empty or too-long name", () => {
    expect(validateHouseholdName("   ")).toEqual({
      ok: false,
      code: "invalid_name",
    });
    expect(validateHouseholdName("x".repeat(81))).toEqual({
      ok: false,
      code: "invalid_name",
    });
  });
});
