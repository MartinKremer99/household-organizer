import { describe, expect, it } from "vitest";
import { catalogErrorMessage } from "@/features/catalog/ui/catalog-errors";
import { syncStatusErrorMessage } from "./sync-errors";

describe("syncStatusErrorMessage", () => {
  it("reuses catalog copy for barcode and name collisions", () => {
    expect(syncStatusErrorMessage({ kind: "business", code: "duplicate_barcode" })).toBe(
      catalogErrorMessage("duplicate_barcode"),
    );
    expect(syncStatusErrorMessage({ kind: "business", code: "duplicate_name" })).toBe(
      catalogErrorMessage("duplicate_name"),
    );
    expect(syncStatusErrorMessage({ kind: "business", code: "invalid_barcode" })).toBe(
      catalogErrorMessage("invalid_barcode"),
    );
  });

  it("keeps the generic business line for stock and conflict codes", () => {
    expect(syncStatusErrorMessage({ kind: "business", code: "insufficient_stock" })).toBe(
      "Could not apply a change. Check quantities and try again.",
    );
    expect(syncStatusErrorMessage({ kind: "business", code: "conflict" })).toBe(
      "Could not apply a change. Check quantities and try again.",
    );
  });

  it("uses the transient line when the server cannot be reached", () => {
    expect(syncStatusErrorMessage({ kind: "transient", code: null })).toBe(
      "Could not reach the server. Try again.",
    );
  });
});
