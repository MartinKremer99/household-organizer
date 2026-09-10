import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import {
  closeHouseholdDbForTests,
  getHouseholdDb,
  resetHouseholdDbForTests,
} from "../db/database";
import type { SyncMetadata } from "../db/types";
import { syncMetadataRepository } from "./sync-metadata-repository";

const HOUSEHOLD = "household-a";

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("syncMetadataRepository", () => {
  it("returns null when a household has never synced", async () => {
    expect(await syncMetadataRepository.get(HOUSEHOLD)).toBeNull();
  });

  it("records a never_synced attempt without a successful timestamp", async () => {
    const row = await syncMetadataRepository.markAttemptStarted(HOUSEHOLD);

    expect(row.last_status).toBe("never_synced");
    expect(row.last_attempt_at).toEqual(expect.any(String));
    expect(row.last_sync_at).toBeNull();
    expect(await syncMetadataRepository.get(HOUSEHOLD)).toMatchObject({
      last_status: "never_synced",
      last_sync_at: null,
    });
  });

  it("records a successful sync and clears errors", async () => {
    await syncMetadataRepository.markAttemptStarted(HOUSEHOLD);
    await syncMetadataRepository.recordFailure(HOUSEHOLD, {
      kind: "transient",
      code: "transient_error",
      message: "Failed to fetch",
      stopReason: "transient_error",
    });

    const row = await syncMetadataRepository.recordSuccess(HOUSEHOLD, {
      hasPending: false,
      stopReason: "empty",
    });

    expect(row.last_status).toBe("synced");
    expect(row.last_sync_at).toEqual(expect.any(String));
    expect(row.last_error_kind).toBeNull();
    expect(row.last_error_code).toBeNull();
    expect(row.last_error_message).toBeNull();
    expect(row.last_stop_reason).toBe("empty");
  });

  it("records pending when remaining work is reported", async () => {
    await syncMetadataRepository.markAttemptStarted(HOUSEHOLD);
    const row = await syncMetadataRepository.recordSuccess(HOUSEHOLD, {
      hasPending: true,
      stopReason: "completed",
    });

    expect(row.last_status).toBe("pending");
    expect(row.last_sync_at).toEqual(expect.any(String));
  });

  it("does not erase the last successful sync timestamp on failure", async () => {
    await syncMetadataRepository.markAttemptStarted(HOUSEHOLD);
    const success = await syncMetadataRepository.recordSuccess(HOUSEHOLD, {
      hasPending: false,
      stopReason: "completed",
    });

    const failed = await syncMetadataRepository.recordFailure(HOUSEHOLD, {
      kind: "business",
      code: "insufficient_stock",
      message: "insufficient_stock",
      stopReason: "business_rejection",
    });

    expect(failed.last_status).toBe("failed");
    expect(failed.last_error_kind).toBe("business");
    expect(failed.last_sync_at).toBe(success.last_sync_at);
  });

  it("normalizes missing keys on old rows", async () => {
    await getHouseholdDb().sync_metadata.put({
      household_id: HOUSEHOLD,
      last_sync_at: "2026-09-09T10:00:00.000Z",
      last_server_cursor: null,
      schema_version: 1,
    } as SyncMetadata);

    expect(await syncMetadataRepository.get(HOUSEHOLD)).toMatchObject({
      last_status: "never_synced",
      last_attempt_at: null,
      last_error_kind: null,
      last_error_code: null,
      last_error_message: null,
      last_stop_reason: null,
      last_sync_at: "2026-09-09T10:00:00.000Z",
    });
  });

  it("keeps persisted metadata after reopening Dexie", async () => {
    await syncMetadataRepository.markAttemptStarted(HOUSEHOLD);
    await syncMetadataRepository.recordSuccess(HOUSEHOLD, {
      hasPending: false,
      stopReason: "completed",
    });
    const before = await syncMetadataRepository.get(HOUSEHOLD);

    closeHouseholdDbForTests();
    getHouseholdDb();

    expect(await syncMetadataRepository.get(HOUSEHOLD)).toEqual(before);
  });
});
