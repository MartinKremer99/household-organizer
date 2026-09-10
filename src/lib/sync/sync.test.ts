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
import { createPendingOperation, enqueue } from "./outbox";
import { reconcileHousehold } from "./reconcile";
import { resetSyncHouseholdForTests, syncHousehold } from "./sync";
import { syncMetadataRepository } from "./sync-metadata-repository";
import type { UploadPendingResult } from "./uploader";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => {
    throw new Error("production createClient must not run in coordinator tests");
  }),
}));

vi.mock("./reconcile", () => ({
  reconcileHousehold: vi.fn().mockResolvedValue({
    ok: true,
    server_cursor: "2026-09-10T12:00:00.000Z",
  }),
}));

vi.mock("@/features/household/application/hydrate-household", () => ({
  ensureLocalHousehold: vi.fn().mockResolvedValue({ ok: false, code: "no_household" }),
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

async function enqueuePending(householdId: string, operationId: string): Promise<void> {
  await enqueue(
    createPendingOperation({
      household_id: householdId,
      operation_id: operationId,
      operation_type: "INVENTORY_DELTA",
      payload: {
        product_id: "product-1",
        location_id: "location-1",
        operation_type: "REMOVE",
        allocations: [{ inventory_lot_id: "lot-1", delta: -1 }],
      },
    }),
  );
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
  resetSyncHouseholdForTests();
  vi.mocked(createClient).mockClear();
  vi.mocked(reconcileHousehold).mockClear();
  vi.mocked(reconcileHousehold).mockResolvedValue({
    ok: true,
    server_cursor: "2026-09-10T12:00:00.000Z",
  });
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
    expect(await syncMetadataRepository.get(HOUSEHOLD_A)).toBeNull();
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
    expect(await syncMetadataRepository.get(HOUSEHOLD_A)).toBeNull();
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
    expect(await syncMetadataRepository.get(HOUSEHOLD_A)).toBeNull();
    expect(await syncMetadataRepository.get(HOUSEHOLD_B)).toBeNull();
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

    const metadata = await syncMetadataRepository.get(HOUSEHOLD_A);
    expect(metadata?.last_attempt_at).toEqual(expect.any(String));
    expect(metadata?.last_status).toBe("synced");
    expect(metadata?.last_sync_at).toEqual(expect.any(String));
    expect(metadata?.last_stop_reason).toBe("completed");
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

  it("records synced metadata when the uploader reports an empty queue", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);

    const result = await syncHousehold({
      supabase: sessionClient(USER_A),
      uploadPendingOperations: vi.fn().mockResolvedValue(
        uploadResult({
          stop_reason: "empty",
          uploaded_operation_ids: [],
        }),
      ),
    });

    expect(result.status).toBe("completed");
    const metadata = await syncMetadataRepository.get(HOUSEHOLD_A);
    expect(metadata?.last_status).toBe("synced");
    expect(metadata?.last_sync_at).toEqual(expect.any(String));
    expect(metadata?.last_stop_reason).toBe("empty");
    expect(metadata?.last_error_kind).toBeNull();
  });

  it("records pending metadata when a pending outbox row remains after completed", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    await enqueuePending(HOUSEHOLD_A, "op-leftover");

    const result = await syncHousehold({
      supabase: sessionClient(USER_A),
      uploadPendingOperations: vi.fn().mockResolvedValue(uploadResult()),
    });

    expect(result.status).toBe("completed");
    const metadata = await syncMetadataRepository.get(HOUSEHOLD_A);
    expect(metadata?.last_status).toBe("pending");
    expect(metadata?.last_sync_at).toEqual(expect.any(String));
    expect(metadata?.last_stop_reason).toBe("completed");
  });

  it("records failed metadata for transient and business uploader outcomes", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    const supabase = sessionClient(USER_A);

    await syncHousehold({
      supabase,
      uploadPendingOperations: vi.fn().mockResolvedValue(
        uploadResult({
          stop_reason: "transient_error",
          uploaded_operation_ids: [],
          error: { code: "transient_error", message: "Failed to fetch" },
        }),
      ),
    });

    expect(await syncMetadataRepository.get(HOUSEHOLD_A)).toMatchObject({
      last_status: "failed",
      last_error_kind: "transient",
      last_error_code: "transient_error",
      last_stop_reason: "transient_error",
    });

    resetSyncHouseholdForTests();
    await syncHousehold({
      supabase,
      uploadPendingOperations: vi.fn().mockResolvedValue(
        uploadResult({
          stop_reason: "conflict",
          stopped_operation_id: "op-1",
          error: { code: "conflict", message: "conflict" },
        }),
      ),
    });

    expect(await syncMetadataRepository.get(HOUSEHOLD_A)).toMatchObject({
      last_status: "failed",
      last_error_kind: "business",
      last_error_code: "conflict",
      last_stop_reason: "conflict",
    });
  });

  it("leaves local inventory unchanged when reconcile is a no-op", async () => {
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

  it("reconciles after empty or completed upload and stores the cursor", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    const supabase = sessionClient(USER_A);

    await syncHousehold({
      supabase,
      uploadPendingOperations: vi.fn().mockResolvedValue(
        uploadResult({ stop_reason: "empty", uploaded_operation_ids: [] }),
      ),
    });

    expect(reconcileHousehold).toHaveBeenCalledWith(HOUSEHOLD_A, supabase);
    expect(await syncMetadataRepository.get(HOUSEHOLD_A)).toMatchObject({
      last_status: "synced",
      last_server_cursor: "2026-09-10T12:00:00.000Z",
    });
  });

  it("does not reconcile after business or transient upload stops", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    const supabase = sessionClient(USER_A);

    await syncHousehold({
      supabase,
      uploadPendingOperations: vi.fn().mockResolvedValue(
        uploadResult({
          stop_reason: "business_rejection",
          uploaded_operation_ids: [],
          stopped_operation_id: "op-2",
          error: { code: "duplicate_name", message: "duplicate_name" },
        }),
      ),
    });
    expect(reconcileHousehold).not.toHaveBeenCalled();

    resetSyncHouseholdForTests();
    await syncHousehold({
      supabase,
      uploadPendingOperations: vi.fn().mockResolvedValue(
        uploadResult({
          stop_reason: "transient_error",
          uploaded_operation_ids: [],
          error: { code: "transient_error", message: "Failed to fetch" },
        }),
      ),
    });
    expect(reconcileHousehold).not.toHaveBeenCalled();
  });

  it("hydrates a missing membership then uploads", async () => {
    const supabase = sessionClient(USER_A);
    const upload = vi.fn().mockResolvedValue(uploadResult({ stop_reason: "empty", uploaded_operation_ids: [] }));
    const ensure = vi.fn().mockImplementation(async () => {
      await putMembership(HOUSEHOLD_A, USER_A);
      return { ok: true, household: { id: HOUSEHOLD_A, name: "Home", join_code: "ABCDEFGHIJ", created_at: "2026-09-09T10:00:00.000Z", updated_at: "2026-09-09T10:00:00.000Z" } };
    });

    const result = await syncHousehold({
      supabase,
      uploadPendingOperations: upload,
      ensureLocalHousehold: ensure,
    });

    expect(ensure).toHaveBeenCalledWith({ userId: USER_A });
    expect(upload).toHaveBeenCalledWith(HOUSEHOLD_A, { supabase });
    expect(result.status).toBe("completed");
  });

  it("records transient failure when reconcile fails after a successful upload", async () => {
    await putMembership(HOUSEHOLD_A, USER_A);
    vi.mocked(reconcileHousehold).mockResolvedValue({
      ok: false,
      code: "transient_error",
    });

    const result = await syncHousehold({
      supabase: sessionClient(USER_A),
      uploadPendingOperations: vi.fn().mockResolvedValue(uploadResult()),
    });

    expect(result.status).toBe("transient_error");
    expect(await syncMetadataRepository.get(HOUSEHOLD_A)).toMatchObject({
      last_status: "failed",
      last_error_kind: "transient",
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
