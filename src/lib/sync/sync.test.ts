import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { householdRepository } from "@/features/household/repositories/household-repository";
import { inventoryRepository } from "@/features/inventory/repositories/inventory-repository";
import { createClient } from "@/lib/supabase/client";
import { resetHouseholdDbForTests } from "../db/database";
import { resetSyncHouseholdForTests, syncHousehold } from "./sync";
import type { UploadPendingResult } from "./uploader";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => {
    throw new Error("production createClient must not run in coordinator tests");
  }),
}));

const USER_A = "user-a";
const USER_B = "user-b";
const HOUSEHOLD_A = "household-a";
const HOUSEHOLD_B = "household-b";

function sessionClient(userId: string | null): SupabaseClient {
  return {
    auth: {
      getSession: async () => ({
        data: {
          session: userId
            ? { access_token: "user-jwt", user: { id: userId } }
            : null,
        },
        error: null,
      }),
    },
  } as unknown as SupabaseClient;
}

function uploadResult(
  overrides: Partial<UploadPendingResult> = {},
): UploadPendingResult {
  return {
    stop_reason: "completed",
    uploaded_operation_ids: ["op-1"],
    stopped_operation_id: null,
    error: null,
    ...overrides,
  };
}

async function putMembership(householdId: string, userId: string): Promise<void> {
  await householdRepository.putMember({
    household_id: householdId,
    user_id: userId,
    created_at: "2026-09-09T10:00:00.000Z",
  });
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
  resetSyncHouseholdForTests();
  vi.mocked(createClient).mockClear();
});

describe("syncHousehold", () => {
  it("returns unauthenticated when there is no session", async () => {
    const upload = vi.fn();

    const result = await syncHousehold({
      supabase: sessionClient(null),
      uploadPendingOperations: upload,
    });

    expect(result).toEqual({
      status: "unauthenticated",
      household_id: null,
      uploaded_operation_ids: [],
      stopped_operation_id: null,
      stop_reason: null,
      error: null,
    });
    expect(upload).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns no_household when the user has no membership", async () => {
    const upload = vi.fn();

    const result = await syncHousehold({
      supabase: sessionClient(USER_A),
      uploadPendingOperations: upload,
    });

    expect(result.status).toBe("no_household");
    expect(result.household_id).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it("returns no_household when the user has more than one membership", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    await putMembership(HOUSEHOLD_B, USER_A);
    const upload = vi.fn();

    const result = await syncHousehold({
      supabase: sessionClient(USER_A),
      uploadPendingOperations: upload,
    });

    expect(result.status).toBe("no_household");
    expect(upload).not.toHaveBeenCalled();
  });

  it("invokes the uploader for the membership household with the injected client", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    const supabase = sessionClient(USER_A);
    const upload = vi.fn().mockResolvedValue(uploadResult());

    const result = await syncHousehold({
      supabase,
      uploadPendingOperations: upload,
    });

    expect(result.status).toBe("completed");
    expect(result.household_id).toBe(HOUSEHOLD_A);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(HOUSEHOLD_A, { supabase });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("maps uploader outcomes without changing business codes", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    const supabase = sessionClient(USER_A);

    const cases: Array<[UploadPendingResult, "completed" | "stopped" | "transient_error"]> = [
      [uploadResult({ stop_reason: "completed" }), "completed"],
      [
        uploadResult({
          stop_reason: "empty",
          uploaded_operation_ids: [],
        }),
        "completed",
      ],
      [
        uploadResult({
          stop_reason: "conflict",
          stopped_operation_id: "op-1",
          error: { code: "conflict", message: "conflict" },
        }),
        "stopped",
      ],
      [
        uploadResult({
          stop_reason: "business_rejection",
          uploaded_operation_ids: [],
          stopped_operation_id: "op-2",
          error: { code: "insufficient_stock", message: "insufficient_stock" },
        }),
        "stopped",
      ],
      [
        uploadResult({
          stop_reason: "transient_error",
          uploaded_operation_ids: [],
          error: { code: "transient_error", message: "Failed to fetch" },
        }),
        "transient_error",
      ],
    ];

    for (const [uploaded, status] of cases) {
      resetSyncHouseholdForTests();
      const result = await syncHousehold({
        supabase,
        uploadPendingOperations: vi.fn().mockResolvedValue(uploaded),
      });
      expect(result.status).toBe(status);
      expect(result.stop_reason).toBe(uploaded.stop_reason);
      expect(result.uploaded_operation_ids).toEqual(uploaded.uploaded_operation_ids);
      expect(result.stopped_operation_id).toBe(uploaded.stopped_operation_id);
      expect(result.error).toEqual(uploaded.error);
      expect(result.household_id).toBe(HOUSEHOLD_A);
    }
  });

  it("shares one in-flight upload for the same household", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    const supabase = sessionClient(USER_A);
    let finish!: (value: UploadPendingResult) => void;
    const deferred = new Promise<UploadPendingResult>((resolve) => {
      finish = resolve;
    });
    const upload = vi.fn().mockReturnValue(deferred);

    const first = syncHousehold({
      supabase,
      uploadPendingOperations: upload,
    });
    const second = syncHousehold({
      supabase,
      uploadPendingOperations: upload,
    });

    await vi.waitFor(() => {
      expect(upload).toHaveBeenCalledTimes(1);
    });

    const uploaded = uploadResult({ uploaded_operation_ids: ["shared"] });
    finish(uploaded);
    const [left, right] = await Promise.all([first, second]);

    expect(left).toEqual(right);
    expect(left.uploaded_operation_ids).toEqual(["shared"]);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("does not block a different household", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    await putMembership(HOUSEHOLD_B, USER_B);
    const seen: string[] = [];
    const upload = vi.fn().mockImplementation(async (householdId: string) => {
      seen.push(householdId);
      return uploadResult({ uploaded_operation_ids: [householdId] });
    });

    const [left, right] = await Promise.all([
      syncHousehold({
        supabase: sessionClient(USER_A),
        uploadPendingOperations: upload,
      }),
      syncHousehold({
        supabase: sessionClient(USER_B),
        uploadPendingOperations: upload,
      }),
    ]);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(seen.sort()).toEqual([HOUSEHOLD_A, HOUSEHOLD_B]);
    expect(left.household_id).toBe(HOUSEHOLD_A);
    expect(right.household_id).toBe(HOUSEHOLD_B);
  });

  it("does not modify local inventory", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    await inventoryRepository.putLot({
      id: "lot-1",
      household_id: HOUSEHOLD_A,
      product_id: "product-1",
      location_id: "location-1",
      quantity: 7,
      expiration_date: null,
      created_at: "2026-09-09T10:00:00.000Z",
      updated_at: "2026-09-09T10:00:00.000Z",
    });

    await syncHousehold({
      supabase: sessionClient(USER_A),
      uploadPendingOperations: vi.fn().mockResolvedValue(uploadResult()),
    });

    expect(await inventoryRepository.getLotById(HOUSEHOLD_A, "lot-1")).toMatchObject({
      quantity: 7,
    });
  });

  it("does not import React, Next, server Supabase, or mutate-inventory", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "sync.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
    expect(source).not.toMatch(/lib\/supabase\/server/);
    expect(source).not.toMatch(/mutate-inventory/);
    expect(source).not.toMatch(/service_role/);
    expect(source).not.toMatch(/SERVICE_ROLE/);
  });
});
