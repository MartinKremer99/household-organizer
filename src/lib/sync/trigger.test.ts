import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { SyncHouseholdOptions, SyncHouseholdResult } from "./sync";
import { triggerHouseholdSync } from "./trigger";

function coordinatorResult(
  overrides: Partial<SyncHouseholdResult> = {},
): SyncHouseholdResult {
  return {
    status: "completed",
    household_id: "household-a",
    uploaded_operation_ids: ["op-1"],
    stopped_operation_id: null,
    stop_reason: "completed",
    error: null,
    ...overrides,
  };
}

describe("triggerHouseholdSync", () => {
  it("delegates to the injected coordinator once", async () => {
    const sync = vi.fn().mockResolvedValue(coordinatorResult());

    await triggerHouseholdSync({ syncHousehold: sync });

    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("forwards coordinator options and strips the injector", async () => {
    const supabase = { auth: {} } as unknown as SupabaseClient;
    const uploadPendingOperations = vi.fn() as unknown as NonNullable<
      SyncHouseholdOptions["uploadPendingOperations"]
    >;
    const sync = vi.fn().mockResolvedValue(coordinatorResult());

    await triggerHouseholdSync({
      supabase,
      uploadPendingOperations,
      syncHousehold: sync,
    });

    expect(sync).toHaveBeenCalledWith({ supabase, uploadPendingOperations });
    expect(sync.mock.calls[0][0]).not.toHaveProperty("syncHousehold");
  });

  it("returns the coordinator result unchanged", async () => {
    const result = coordinatorResult({ status: "stopped" });
    const sync = vi.fn().mockResolvedValue(result);

    await expect(triggerHouseholdSync({ syncHousehold: sync })).resolves.toBe(result);
  });

  it("forwards an empty options bag when only the injector is provided", async () => {
    const sync = vi.fn().mockResolvedValue(coordinatorResult());

    await triggerHouseholdSync({ syncHousehold: sync });

    expect(sync).toHaveBeenCalledWith({});
  });

  it("does not import React, Next, Supabase, Dexie, outbox, or repositories", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "trigger.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
    expect(source).not.toMatch(/from ["'][^"']*lib\/supabase\//);
    expect(source).not.toMatch(/from ["']@\/lib\/db/);
    expect(source).not.toMatch(/from ["']\.\/uploader["']/);
    expect(source).not.toMatch(/from ["']\.\/outbox["']/);
    expect(source).not.toMatch(/repositories/);
    expect(source).not.toMatch(/service_role/);
    expect(source).not.toMatch(/SERVICE_ROLE/);
    expect(source).not.toMatch(/from ["']dexie["']/);
  });
});
