import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import { HOUSEHOLD_DB_VERSION, resetHouseholdDbForTests } from "@/lib/db";
import type { SyncMetadata } from "@/lib/db";
import { createPendingOperation } from "@/lib/sync/outbox";
import { pendingOperationRepository } from "@/lib/sync/pending-operation-repository";
import { syncMetadataRepository } from "@/lib/sync/sync-metadata-repository";
import { loadSyncStatus } from "./load-sync-status";

const HOUSEHOLD = "household-a";

const payload = {
  product_id: "product-1",
  location_id: "location-1",
  operation_type: "REMOVE" as const,
  allocations: [{ inventory_lot_id: "lot-1", delta: -1 }],
};

function metadata(overrides: Partial<SyncMetadata> = {}): SyncMetadata {
  return {
    household_id: HOUSEHOLD,
    last_sync_at: null,
    last_attempt_at: null,
    last_status: "never_synced",
    last_error_kind: null,
    last_error_code: null,
    last_error_message: null,
    last_stop_reason: null,
    last_server_cursor: null,
    schema_version: HOUSEHOLD_DB_VERSION,
    ...overrides,
  };
}

async function addPending(operationId = "op-1") {
  await pendingOperationRepository.add(
    createPendingOperation({
      household_id: HOUSEHOLD,
      operation_id: operationId,
      operation_type: "INVENTORY_DELTA",
      payload,
    }),
  );
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("loadSyncStatus", () => {
  it("returns never_synced when there is no metadata and no pending rows", async () => {
    await expect(loadSyncStatus(HOUSEHOLD)).resolves.toEqual({
      label: "never_synced",
      last_sync_at: null,
      error_kind: null,
      error_code: null,
    });
  });

  it("returns never_synced for an empty household id", async () => {
    await expect(loadSyncStatus("")).resolves.toEqual({
      label: "never_synced",
      last_sync_at: null,
      error_kind: null,
      error_code: null,
    });
  });

  it("treats synced metadata as pending when outbox rows remain", async () => {
    await syncMetadataRepository.upsert(
      metadata({
        last_status: "synced",
        last_sync_at: "2026-09-09T10:00:00.000Z",
      }),
    );
    await addPending();

    await expect(loadSyncStatus(HOUSEHOLD)).resolves.toEqual({
      label: "pending",
      last_sync_at: "2026-09-09T10:00:00.000Z",
      error_kind: null,
      error_code: null,
    });
  });

  it("keeps failed metadata even when pending rows remain", async () => {
    await syncMetadataRepository.upsert(
      metadata({
        last_status: "failed",
        last_sync_at: "2026-09-08T10:00:00.000Z",
        last_error_kind: "transient",
        last_error_code: "transient_error",
        last_error_message: "Failed to fetch",
      }),
    );
    await addPending();

    await expect(loadSyncStatus(HOUSEHOLD)).resolves.toEqual({
      label: "failed",
      last_sync_at: "2026-09-08T10:00:00.000Z",
      error_kind: "transient",
      error_code: "transient_error",
    });
  });

  it("treats missing metadata as pending when outbox rows exist", async () => {
    await addPending();

    await expect(loadSyncStatus(HOUSEHOLD)).resolves.toEqual({
      label: "pending",
      last_sync_at: null,
      error_kind: null,
      error_code: null,
    });
  });

  it("treats never_synced metadata as pending when outbox rows exist", async () => {
    await syncMetadataRepository.upsert(metadata({ last_status: "never_synced" }));
    await addPending();

    await expect(loadSyncStatus(HOUSEHOLD)).resolves.toEqual({
      label: "pending",
      last_sync_at: null,
      error_kind: null,
      error_code: null,
    });
  });

  it("trusts leftover pending metadata when the outbox is empty", async () => {
    await syncMetadataRepository.upsert(
      metadata({
        last_status: "pending",
        last_sync_at: "2026-09-09T10:00:00.000Z",
      }),
    );

    await expect(loadSyncStatus(HOUSEHOLD)).resolves.toEqual({
      label: "pending",
      last_sync_at: "2026-09-09T10:00:00.000Z",
      error_kind: null,
      error_code: null,
    });
  });

  it("passes through last sync time and error fields without the message", async () => {
    await syncMetadataRepository.upsert(
      metadata({
        last_status: "failed",
        last_sync_at: "2026-09-09T11:30:00.000Z",
        last_error_kind: "business",
        last_error_code: "insufficient_stock",
        last_error_message: "insufficient_stock: lot xyz",
      }),
    );

    const view = await loadSyncStatus(HOUSEHOLD);

    expect(view).toEqual({
      label: "failed",
      last_sync_at: "2026-09-09T11:30:00.000Z",
      error_kind: "business",
      error_code: "insufficient_stock",
    });
    expect(view).not.toHaveProperty("last_error_message");
  });
});
