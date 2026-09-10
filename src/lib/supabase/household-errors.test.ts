import { describe, expect, it } from "vitest";
import { mapHouseholdError } from "./household-errors";

describe("mapHouseholdError", () => {
  it("asks the user to sign in again when the session user is gone", () => {
    expect(mapHouseholdError("not_authenticated")).toBe(
      "Your session expired. Sign in again.",
    );
  });

  it("maps membership and validation errors", () => {
    expect(mapHouseholdError("already_member")).toBe("You already belong to a household.");
    expect(mapHouseholdError("invalid_name")).toBe(
      "Enter a household name (1–80 characters).",
    );
    expect(mapHouseholdError("invalid_join_code")).toBe("Invalid join code.");
  });

  it("maps a missing create_household RPC", () => {
    expect(
      mapHouseholdError(
        "Could not find the function public.create_household(p_name) in the schema cache",
      ),
    ).toBe("Household setup is not available. Apply the latest database migrations.");
  });
});
