import { HOUSEHOLD_DB_VERSION, getHouseholdDb } from "@/lib/db";
import type { SyncErrorKind, SyncMetadata } from "@/lib/db";

const ERROR_CODE_MAX = 64;
const ERROR_MESSAGE_MAX = 200;

function bound(value: string | null | undefined, max: number): string | null {
  if (value == null || value.length === 0) {
    return null;
  }
  return value.length <= max ? value : value.slice(0, max);
}

function emptyRow(householdId: string): SyncMetadata {
  return {
    household_id: householdId,
    last_sync_at: null,
    last_attempt_at: null,
    last_status: "never_synced",
    last_error_kind: null,
    last_error_code: null,
    last_error_message: null,
    last_stop_reason: null,
    last_server_cursor: null,
    schema_version: HOUSEHOLD_DB_VERSION,
  };
}

function normalize(row: Partial<SyncMetadata> & { household_id: string }): SyncMetadata {
  const base = emptyRow(row.household_id);
  return {
    ...base,
    ...row,
    last_sync_at: row.last_sync_at ?? null,
    last_attempt_at: row.last_attempt_at ?? null,
    last_status: row.last_status ?? "never_synced",
    last_error_kind: row.last_error_kind ?? null,
    last_error_code: row.last_error_code ?? null,
    last_error_message: row.last_error_message ?? null,
    last_stop_reason: row.last_stop_reason ?? null,
    last_server_cursor: row.last_server_cursor ?? null,
    schema_version: row.schema_version ?? HOUSEHOLD_DB_VERSION,
  };
}

async function read(householdId: string): Promise<SyncMetadata | null> {
  const row = await getHouseholdDb().sync_metadata.get(householdId);
  return row ? normalize(row) : null;
}

export const syncMetadataRepository = {
  async get(householdId: string): Promise<SyncMetadata | null> {
    return read(householdId);
  },

  async upsert(record: SyncMetadata): Promise<void> {
    await getHouseholdDb().sync_metadata.put(normalize(record));
  },

  async markAttemptStarted(householdId: string): Promise<SyncMetadata> {
    const existing = await read(householdId);
    const next = normalize({
      ...(existing ?? emptyRow(householdId)),
      last_attempt_at: new Date().toISOString(),
    });
    await getHouseholdDb().sync_metadata.put(next);
    return next;
  },

  async recordSuccess(
    householdId: string,
    input: { hasPending: boolean; stopReason: string; lastServerCursor?: string | null },
  ): Promise<SyncMetadata> {
    const existing = await read(householdId);
    const next = normalize({
      ...(existing ?? emptyRow(householdId)),
      last_sync_at: new Date().toISOString(),
      last_status: input.hasPending ? "pending" : "synced",
      last_error_kind: null,
      last_error_code: null,
      last_error_message: null,
      last_stop_reason: input.stopReason,
      last_server_cursor:
        input.lastServerCursor === undefined
          ? existing?.last_server_cursor ?? null
          : input.lastServerCursor,
    });
    await getHouseholdDb().sync_metadata.put(next);
    return next;
  },

  async recordFailure(
    householdId: string,
    input: {
      kind: SyncErrorKind;
      code: string | null;
      message: string | null;
      stopReason: string;
    },
  ): Promise<SyncMetadata> {
    const existing = await read(householdId);
    const next = normalize({
      ...(existing ?? emptyRow(householdId)),
      last_status: "failed",
      last_error_kind: input.kind,
      last_error_code: bound(input.code, ERROR_CODE_MAX),
      last_error_message: bound(input.message, ERROR_MESSAGE_MAX),
      last_stop_reason: input.stopReason,
    });
    await getHouseholdDb().sync_metadata.put(next);
    return next;
  },
};
