import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { resetHouseholdDbForTests } from "../db/database";
import type { OutboxPayload } from "../db/types";
import { createPendingOperation, enqueue, getByOperationId, listPending } from "./outbox";
import { uploadPendingOperations } from "./uploader";

const HOUSEHOLD_A = "household-a";
const HOUSEHOLD_B = "household-b";

const addPayload: OutboxPayload = {
  product_id: "product-1",
  location_id: "location-1",
  operation_type: "ADD",
  allocations: [
    { inventory_lot_id: "lot-1", delta: 2, expiration_date: null },
  ],
  client_created_at: "2026-09-09T10:00:00.000Z",
};

type RpcCall = { fn: string; args: Record<string, unknown> };

function payload(
  overrides: Partial<OutboxPayload> = {},
): OutboxPayload {
  return {
    ...addPayload,
    allocations: overrides.allocations ?? addPayload.allocations,
    ...overrides,
  };
}

function pendingInput(
  overrides: Partial<{
    household_id: string;
    operation_id: string;
    created_at: string;
    payload: OutboxPayload;
  }> = {},
) {
  return {
    household_id: overrides.household_id ?? HOUSEHOLD_A,
    operation_id: overrides.operation_id ?? "op-1",
    operation_type: "INVENTORY_DELTA" as const,
    payload: overrides.payload ?? addPayload,
    created_at: overrides.created_at ?? "2026-09-09T10:00:00.000Z",
  };
}

function mockClient(options: {
  session?: { access_token: string } | null;
  responses?: Array<{ data: unknown; error?: unknown }>;
  onRpc?: (call: RpcCall) => { data: unknown; error?: unknown };
}): { client: SupabaseClient; calls: RpcCall[] } {
  const calls: RpcCall[] = [];
  let index = 0;
  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session:
            options.session === undefined
              ? { access_token: "user-jwt" }
              : options.session,
        },
        error: null,
      }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const call = { fn, args };
      calls.push(call);
      if (options.onRpc) {
        return options.onRpc(call);
      }
      const next = options.responses?.[index] ?? {
        data: { ok: true, status: "applied", operation_id: args.p_operation_id },
      };
      index += 1;
      return { data: next.data, error: next.error ?? null };
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("uploadPendingOperations", () => {
  it("uploads one pending operation and removes it after applied", async () => {
    await enqueue(createPendingOperation(pendingInput()));
    const { client, calls } = mockClient({});

    const result = await uploadPendingOperations(HOUSEHOLD_A, { supabase: client });

    expect(result).toEqual({
      stop_reason: "completed",
      uploaded_operation_ids: ["op-1"],
      stopped_operation_id: null,
      error: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe("apply_inventory_command");
    expect(calls[0]?.args.p_operation_id).toBe("op-1");
    expect(calls[0]?.args.p_allocations).toEqual(addPayload.allocations);
    expect(calls[0]?.args).not.toHaveProperty("p_user_id");
    expect(calls[0]?.args).not.toHaveProperty("p_household_id");
    expect(await getByOperationId(HOUSEHOLD_A, "op-1")).toBeNull();
  });

  it("removes the outbox row after already_applied", async () => {
    await enqueue(createPendingOperation(pendingInput()));
    const { client, calls } = mockClient({
      responses: [{ data: { ok: true, status: "already_applied", operation_id: "op-1" } }],
    });

    const result = await uploadPendingOperations(HOUSEHOLD_A, { supabase: client });

    expect(result.stop_reason).toBe("completed");
    expect(result.uploaded_operation_ids).toEqual(["op-1"]);
    expect(calls[0]?.args.p_operation_id).toBe("op-1");
    expect(await listPending(HOUSEHOLD_A)).toEqual([]);
  });

  it("marks a conflict failed without rewriting the payload or id", async () => {
    const created = createPendingOperation(pendingInput());
    await enqueue(created);
    const { client } = mockClient({
      responses: [{ data: { ok: false, code: "conflict" } }],
    });

    const result = await uploadPendingOperations(HOUSEHOLD_A, { supabase: client });
    const stored = await getByOperationId(HOUSEHOLD_A, "op-1");

    expect(result.stop_reason).toBe("conflict");
    expect(result.stopped_operation_id).toBe("op-1");
    expect(stored?.status).toBe("failed");
    expect(stored?.last_error).toBe("conflict");
    expect(stored?.operation_id).toBe(created.operation_id);
    expect(stored?.payload).toEqual(created.payload);
    expect(stored?.created_at).toBe(created.created_at);
  });

  it("marks insufficient stock failed and does not send a second RPC", async () => {
    await enqueue(createPendingOperation(pendingInput()));
    await enqueue(
      createPendingOperation(
        pendingInput({
          operation_id: "op-2",
          created_at: "2026-09-09T11:00:00.000Z",
        }),
      ),
    );
    const { client, calls } = mockClient({
      responses: [{ data: { ok: false, code: "insufficient_stock" } }],
    });

    const result = await uploadPendingOperations(HOUSEHOLD_A, { supabase: client });

    expect(result.stop_reason).toBe("business_rejection");
    expect(result.error?.code).toBe("insufficient_stock");
    expect(calls).toHaveLength(1);
    expect(await getByOperationId(HOUSEHOLD_A, "op-1")).toMatchObject({
      status: "failed",
      last_error: "insufficient_stock",
      retry_count: 1,
    });
    expect(await getByOperationId(HOUSEHOLD_A, "op-2")).toMatchObject({
      status: "pending",
      retry_count: 0,
    });
  });

  it("preserves a pending row after a network failure", async () => {
    const created = createPendingOperation(pendingInput());
    await enqueue(created);
    const { client } = mockClient({
      onRpc: () => {
        throw new Error("Failed to fetch");
      },
    });

    const result = await uploadPendingOperations(HOUSEHOLD_A, { supabase: client });
    const stored = await getByOperationId(HOUSEHOLD_A, "op-1");

    expect(result.stop_reason).toBe("transient_error");
    expect(stored?.status).toBe("pending");
    expect(stored?.retry_count).toBe(1);
    expect(stored?.last_attempt_at).not.toBeNull();
    expect(stored?.operation_id).toBe(created.operation_id);
    expect(stored?.payload).toEqual(created.payload);
    expect(stored?.created_at).toBe(created.created_at);
  });

  it("uploads in created_at then operation_id order and removes the first before the next RPC", async () => {
    await enqueue(
      createPendingOperation(
        pendingInput({
          operation_id: "op-later",
          created_at: "2026-09-09T12:00:00.000Z",
        }),
      ),
    );
    await enqueue(
      createPendingOperation(
        pendingInput({
          operation_id: "op-b",
          created_at: "2026-09-09T11:00:00.000Z",
        }),
      ),
    );
    await enqueue(
      createPendingOperation(
        pendingInput({
          operation_id: "op-a",
          created_at: "2026-09-09T11:00:00.000Z",
        }),
      ),
    );

    const seen: string[] = [];
    const { client } = mockClient({
      onRpc: (call) => {
        seen.push(call.args.p_operation_id as string);
        if (call.args.p_operation_id === "op-b") {
          return { data: { ok: false, code: "insufficient_stock" } };
        }
        return {
          data: { ok: true, status: "applied", operation_id: call.args.p_operation_id },
        };
      },
    });

    const result = await uploadPendingOperations(HOUSEHOLD_A, { supabase: client });

    expect(seen).toEqual(["op-a", "op-b"]);
    expect(result.uploaded_operation_ids).toEqual(["op-a"]);
    expect(result.stopped_operation_id).toBe("op-b");
    expect(await getByOperationId(HOUSEHOLD_A, "op-a")).toBeNull();
    expect(await getByOperationId(HOUSEHOLD_A, "op-b")).toMatchObject({
      status: "failed",
    });
    expect(await getByOperationId(HOUSEHOLD_A, "op-later")).toMatchObject({
      status: "pending",
      retry_count: 0,
    });
  });

  it("does not upload another household's operations", async () => {
    await enqueue(createPendingOperation(pendingInput({ operation_id: "op-a" })));
    await enqueue(
      createPendingOperation(
        pendingInput({ household_id: HOUSEHOLD_B, operation_id: "op-b" }),
      ),
    );
    const { client, calls } = mockClient({});

    await uploadPendingOperations(HOUSEHOLD_A, { supabase: client });

    expect(calls.map((call) => call.args.p_operation_id)).toEqual(["op-a"]);
    expect(await getByOperationId(HOUSEHOLD_B, "op-b")).not.toBeNull();
  });

  it("does not upload when household context is missing", async () => {
    await enqueue(createPendingOperation(pendingInput()));
    const { client, calls } = mockClient({});

    const result = await uploadPendingOperations("   ", { supabase: client });

    expect(result.stop_reason).toBe("no_household");
    expect(calls).toHaveLength(0);
    expect(await getByOperationId(HOUSEHOLD_A, "op-1")).toMatchObject({
      status: "pending",
      retry_count: 0,
    });
  });

  it("does not attempt an upload without a session", async () => {
    await enqueue(createPendingOperation(pendingInput()));
    const { client, calls } = mockClient({ session: null });

    const result = await uploadPendingOperations(HOUSEHOLD_A, { supabase: client });

    expect(result.stop_reason).toBe("no_session");
    expect(calls).toHaveLength(0);
    expect(await getByOperationId(HOUSEHOLD_A, "op-1")).toMatchObject({
      status: "pending",
      retry_count: 0,
    });
  });

  it("marks malformed allocations failed without incrementing retry_count", async () => {
    await enqueue(
      createPendingOperation(
        pendingInput({
          payload: payload({ allocations: [] }),
        }),
      ),
    );
    const { client, calls } = mockClient({});

    const result = await uploadPendingOperations(HOUSEHOLD_A, { supabase: client });

    expect(result.stop_reason).toBe("business_rejection");
    expect(result.error?.code).toBe("invalid_operation");
    expect(calls).toHaveLength(0);
    expect(await getByOperationId(HOUSEHOLD_A, "op-1")).toMatchObject({
      status: "failed",
      last_error: "invalid_operation",
      retry_count: 0,
    });
  });

  it("treats bodyless 401 as a transient error", async () => {
    await enqueue(createPendingOperation(pendingInput()));
    const { client } = mockClient({
      responses: [{ data: null, error: { status: 401, message: "JWT expired" } }],
    });

    const result = await uploadPendingOperations(HOUSEHOLD_A, { supabase: client });

    expect(result.stop_reason).toBe("transient_error");
    expect(await getByOperationId(HOUSEHOLD_A, "op-1")).toMatchObject({
      status: "pending",
      retry_count: 1,
    });
  });

  it("does not import React, UI, mutate-inventory, or a service-role key", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "uploader.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
    expect(source).not.toMatch(/mutate-inventory/);
    expect(source).not.toMatch(/lib\/supabase\/server/);
    expect(source).not.toMatch(/service_role/);
    expect(source).not.toMatch(/SERVICE_ROLE/);
  });
});
