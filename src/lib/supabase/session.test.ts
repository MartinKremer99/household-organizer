import { describe, expect, it } from "vitest";
import { getLiveUserId } from "./session";

describe("getLiveUserId", () => {
  it("returns null when Auth has no user", async () => {
    const id = await getLiveUserId({
      getUser: async () => ({ data: { user: null }, error: { message: "missing" } }),
    });
    expect(id).toBeNull();
  });

  it("returns null when Auth reports an error", async () => {
    const id = await getLiveUserId({
      getUser: async () => ({
        data: { user: { id: "user-1" } },
        error: { message: "User from sub claim in JWT does not exist" },
      }),
    });
    expect(id).toBeNull();
  });

  it("returns the user id when Auth has a live user", async () => {
    const id = await getLiveUserId({
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    });
    expect(id).toBe("user-1");
  });
});
