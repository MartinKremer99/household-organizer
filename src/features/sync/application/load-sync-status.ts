import { listPending } from "@/lib/sync/outbox";
import { syncMetadataRepository } from "@/lib/sync/sync-metadata-repository";

export type SyncStatusView = {
  label: "never_synced" | "synced" | "pending" | "failed";
  last_sync_at: string | null;
  error_kind: "transient" | "business" | null;
  error_code: string | null;
};

const EMPTY: SyncStatusView = {
  label: "never_synced",
  last_sync_at: null,
  error_kind: null,
  error_code: null,
};

export async function loadSyncStatus(householdId: string): Promise<SyncStatusView> {
  if (!householdId) {
    return EMPTY;
  }

  const [metadata, pending] = await Promise.all([
    syncMetadataRepository.get(householdId),
    listPending(householdId),
  ]);

  const last_sync_at = metadata?.last_sync_at ?? null;
  const error_kind = metadata?.last_error_kind ?? null;
  const error_code = metadata?.last_error_code ?? null;

  if (metadata?.last_status === "failed") {
    return { label: "failed", last_sync_at, error_kind, error_code };
  }

  if (pending.length > 0 || metadata?.last_status === "pending") {
    return { label: "pending", last_sync_at, error_kind, error_code };
  }

  if (metadata?.last_status === "synced") {
    return { label: "synced", last_sync_at, error_kind, error_code };
  }

  return { label: "never_synced", last_sync_at, error_kind, error_code };
}
