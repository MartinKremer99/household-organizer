import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { getHouseholdDb, resetHouseholdDbForTests } from "../db/database";
import type { OutboxPayload, PendingOperation, Product } from "../db/types";
import { createOperationId } from "./operation-id";
import {
  complete,
  createPendingOperation,
  enqueue,
  getByOperationId,
  listPending,
  markAttempt,
  markFailed,
} from "./outbox";

const HOUSEHOLD_A = "household-a";
const HOUSEHOLD_B = "household-b";

const removePayload: OutboxPayload = {
  product_id: "product-1",
  location_id: "location-1",
  operation_type: "REMOVE",
  allocations: [{ inventory_lot_id: "lot-1", delta: -2 }],
};

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
    payload: overrides.payload ?? removePayload,
    created_at: overrides.created_at ?? "2026-09-09T10:00:00.000Z",
  };
}

function productFixture(householdId: string): Product {
  return {
    id: "product-1",
    household_id: householdId,
    name: "Tomato Sauce",
    category_id: "category-1",
    minimum_stock: 0,
    barcode: null,
    is_active: true,
    created_at: "2026-09-09T10:00:00.000Z",
    updated_at: "2026-09-09T10:00:00.000Z",
  };
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("outbox", () => {
  it("keeps the caller-supplied operation_id on enqueue", async () => {
    const operation_id = createOperationId();
    const stored = await enqueue(
      createPendingOperation(pendingInput({ operation_id })),
    );

    expect(stored.operation_id).toBe(operation_id);
    expect(stored.id).toBe(operation_id);

    const loaded = await getByOperationId(HOUSEHOLD_A, operation_id);
    expect(loaded?.operation_id).toBe(operation_id);
  });

  it("persists the complete inventory replay payload", async () => {
    await enqueue(createPendingOperation(pendingInput()));

    const loaded = await getByOperationId(HOUSEHOLD_A, "op-1");
    expect(loaded?.payload).toEqual(removePayload);
    expect(loaded?.operation_type).toBe("INVENTORY_DELTA");
  });

  it("lists pending operations only for the requested household", async () => {
    await enqueue(createPendingOperation(pendingInput({ operation_id: "op-a" })));
    await enqueue(
      createPendingOperation(
        pendingInput({ household_id: HOUSEHOLD_B, operation_id: "op-b" }),
      ),
    );

    const pendingA = await listPending(HOUSEHOLD_A);
    expect(pendingA.map((row) => row.operation_id)).toEqual(["op-a"]);
  });

  it("returns pending operations by created_at then operation_id", async () => {
    const later = createPendingOperation(
      pendingInput({
        operation_id: "op-later",
        created_at: "2026-09-09T12:00:00.000Z",
      }),
    );
    const earlierB = createPendingOperation(
      pendingInput({
        operation_id: "op-b",
        created_at: "2026-09-09T11:00:00.000Z",
      }),
    );
    const earlierA = createPendingOperation(
      pendingInput({
        operation_id: "op-a",
        created_at: "2026-09-09T11:00:00.000Z",
      }),
    );

    await enqueue(later);
    await enqueue(earlierB);
    await enqueue(earlierA);

    const pending = await listPending(HOUSEHOLD_A);
    expect(pending.map((row) => row.operation_id)).toEqual([
      "op-a",
      "op-b",
      "op-later",
    ]);
  });

  it("retrieves by operation_id and hides other households", async () => {
    await enqueue(createPendingOperation(pendingInput({ operation_id: "op-1" })));

    const found = await getByOperationId(HOUSEHOLD_A, "op-1");
    expect(found?.operation_id).toBe("op-1");
    expect(await getByOperationId(HOUSEHOLD_B, "op-1")).toBeNull();
  });

  it("updates retry metadata when marking an attempt", async () => {
    await enqueue(createPendingOperation(pendingInput()));

    await markAttempt(HOUSEHOLD_A, "op-1", "2026-09-09T13:00:00.000Z");

    const loaded = await getByOperationId(HOUSEHOLD_A, "op-1");
    expect(loaded?.retry_count).toBe(1);
    expect(loaded?.last_attempt_at).toBe("2026-09-09T13:00:00.000Z");
    expect(loaded?.status).toBe("pending");
  });

  it("preserves operation_id, payload, and created_at when marking failed", async () => {
    const created = createPendingOperation(pendingInput());
    await enqueue(created);

    await markFailed(HOUSEHOLD_A, "op-1", "network timeout");

    const loaded = await getByOperationId(HOUSEHOLD_A, "op-1");
    expect(loaded?.operation_id).toBe(created.operation_id);
    expect(loaded?.payload).toEqual(created.payload);
    expect(loaded?.created_at).toBe(created.created_at);
    expect(loaded?.status).toBe("failed");
    expect(loaded?.last_error).toBe("network timeout");
  });

  it("does not increment retry_count when marking failed without an attempt", async () => {
    await enqueue(createPendingOperation(pendingInput()));

    await markFailed(HOUSEHOLD_A, "op-1", "server rejected");

    const loaded = await getByOperationId(HOUSEHOLD_A, "op-1");
    expect(loaded?.retry_count).toBe(0);
    expect(loaded?.status).toBe("failed");
  });

  it("removes the operation after successful completion", async () => {
    await enqueue(createPendingOperation(pendingInput()));

    await complete(HOUSEHOLD_A, "op-1");

    expect(await getByOperationId(HOUSEHOLD_A, "op-1")).toBeNull();
    expect(await listPending(HOUSEHOLD_A)).toEqual([]);
  });

  it("keeps two households' outbox entries isolated", async () => {
    await enqueue(createPendingOperation(pendingInput({ operation_id: "op-a" })));
    await enqueue(
      createPendingOperation(
        pendingInput({ household_id: HOUSEHOLD_B, operation_id: "op-b" }),
      ),
    );

    await markFailed(HOUSEHOLD_A, "op-a", "failed a");
    await complete(HOUSEHOLD_B, "op-a");

    expect(await getByOperationId(HOUSEHOLD_A, "op-a")).toMatchObject({
      status: "failed",
      last_error: "failed a",
    });
    expect(await listPending(HOUSEHOLD_B)).toHaveLength(1);
    expect(await getByOperationId(HOUSEHOLD_B, "op-b")).not.toBeNull();
  });

  it("never changes the operation_id across failure or retry metadata updates", async () => {
    const operation_id = createOperationId();
    await enqueue(createPendingOperation(pendingInput({ operation_id })));

    await markAttempt(HOUSEHOLD_A, operation_id, "2026-09-09T13:00:00.000Z");
    await markFailed(HOUSEHOLD_A, operation_id, "unavailable");
    await markAttempt(HOUSEHOLD_A, operation_id, "2026-09-09T14:00:00.000Z");

    const loaded = await getByOperationId(HOUSEHOLD_A, operation_id);
    expect(loaded?.operation_id).toBe(operation_id);
    expect(loaded?.id).toBe(operation_id);
    expect(loaded?.retry_count).toBe(2);
    expect(loaded?.status).toBe("failed");
  });

  it("has no Next, React, Supabase, or fetch imports", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sources = ["outbox.ts", "operation-id.ts"].map((file) =>
      readFileSync(join(dir, file), "utf8"),
    );

    for (const source of sources) {
      expect(source).not.toMatch(/from ["']next\//);
      expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
      expect(source).not.toMatch(/@supabase/);
      expect(source).not.toMatch(/\bfetch\b/);
    }
  });

  it("rolls back enqueue when the caller Dexie transaction throws", async () => {
    const db = getHouseholdDb();
    const product = productFixture(HOUSEHOLD_A);
    const operation = createPendingOperation(pendingInput());

    await expect(
      db.transaction("rw", db.products, db.pending_operations, async () => {
        await db.products.put(product);
        await enqueue(operation);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    expect(await db.products.get(product.id)).toBeUndefined();
    expect(await getByOperationId(HOUSEHOLD_A, operation.operation_id)).toBeNull();
  });

  it("returns the existing put-away row when enqueue is repeated with the same command", async () => {
    const putAway = {
      household_id: HOUSEHOLD_A,
      operation_id: "op-put",
      operation_type: "PUT_AWAY_PURCHASED_STOCK" as const,
      payload: {
        product_id: "product-1",
        location_id: "location-1",
        quantity: 2,
        expiration_date: "2027-01-10",
        client_created_at: "2026-09-10T10:00:00.000Z",
      },
    };
    const first = await enqueue(createPendingOperation(putAway));
    const second = await enqueue(createPendingOperation(putAway));

    expect(second).toEqual(first);
    expect(await listPending(HOUSEHOLD_A)).toHaveLength(1);
  });

  it("returns the existing row when enqueue is repeated with the same payload", async () => {
    const first = await enqueue(createPendingOperation(pendingInput()));
    const second = await enqueue(createPendingOperation(pendingInput()));

    expect(second).toEqual(first);
    expect(await listPending(HOUSEHOLD_A)).toHaveLength(1);
  });

  it("rejects a reused operation_id with a different payload", async () => {
    await enqueue(createPendingOperation(pendingInput()));

    const conflict: PendingOperation = createPendingOperation(
      pendingInput({
        payload: {
          ...removePayload,
          allocations: [{ inventory_lot_id: "lot-1", delta: -1 }],
        },
      }),
    );

    await expect(enqueue(conflict)).rejects.toThrow("operation_id already exists");
  });

  it("treats allocation location_id as part of payload identity", async () => {
    await enqueue(createPendingOperation(pendingInput()));

    await expect(
      enqueue(
        createPendingOperation(
          pendingInput({
            payload: {
              ...removePayload,
              allocations: [
                {
                  inventory_lot_id: "lot-1",
                  delta: -2,
                  location_id: "location-2",
                },
              ],
            },
          }),
        ),
      ),
    ).rejects.toThrow("operation_id already exists");
  });

  it("treats the same allocations in a different order as the same payload", async () => {
    const first = await enqueue(
      createPendingOperation(
        pendingInput({
          payload: {
            ...removePayload,
            allocations: [
              { inventory_lot_id: "lot-b", delta: -1 },
              { inventory_lot_id: "lot-a", delta: -2 },
            ],
          },
        }),
      ),
    );
    const second = await enqueue(
      createPendingOperation(
        pendingInput({
          payload: {
            ...removePayload,
            allocations: [
              { inventory_lot_id: "lot-a", delta: -2 },
              { inventory_lot_id: "lot-b", delta: -1 },
            ],
          },
        }),
      ),
    );

    expect(second).toEqual(first);
    expect(await listPending(HOUSEHOLD_A)).toHaveLength(1);
  });
});
