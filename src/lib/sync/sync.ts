import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureLocalHousehold,
  type EnsureLocalHouseholdResult,
} from "@/features/household/application/hydrate-household";
import { householdRepository } from "@/features/household/repositories/household-repository";
import { createClient } from "@/lib/supabase/client";
import { listPending } from "./outbox";
import { reconcileHousehold, type ReconcileHouseholdResult } from "./reconcile";
import { syncMetadataRepository } from "./sync-metadata-repository";
import {
  uploadPendingOperations,
  type UploadPendingResult,
  type UploadStopReason,
} from "./uploader";

/**
 * Explicit household sync entry point.
 * Resolves session + exactly one local membership, uploads the outbox,
 * then pulls an authoritative snapshot when upload empties or completes.
 * Concurrent calls for the same household share one in-flight Promise.
 * No timers, reconnect listeners, or Realtime.
 */

export type SyncHouseholdStatus =
  | "unauthenticated"
  | "no_household"
  | "completed"
  | "stopped"
  | "transient_error";

export type SyncHouseholdResult = {
  status: SyncHouseholdStatus;
  household_id: string | null;
  uploaded_operation_ids: string[];
  stopped_operation_id: string | null;
  stop_reason: UploadStopReason | null;
  error: { code: string; message: string } | null;
};

export type SyncHouseholdOptions = {
  supabase?: SupabaseClient;
  uploadPendingOperations?: typeof uploadPendingOperations;
  reconcileHousehold?: (
    householdId: string,
    supabase: SupabaseClient,
  ) => Promise<ReconcileHouseholdResult>;
  ensureLocalHousehold?: (options: {
    userId: string;
  }) => Promise<EnsureLocalHouseholdResult>;
};

const inflight = new Map<string, Promise<SyncHouseholdResult>>();

export function resetSyncHouseholdForTests(): void {
  inflight.clear();
}

function idle(
  status: Extract<SyncHouseholdStatus, "unauthenticated" | "no_household">,
  householdId: string | null = null,
): SyncHouseholdResult {
  return {
    status,
    household_id: householdId,
    uploaded_operation_ids: [],
    stopped_operation_id: null,
    stop_reason: null,
    error: null,
  };
}

function mapUpload(
  householdId: string,
  upload: UploadPendingResult,
): SyncHouseholdResult {
  const shared = {
    household_id: householdId,
    uploaded_operation_ids: upload.uploaded_operation_ids,
    stopped_operation_id: upload.stopped_operation_id,
    stop_reason: upload.stop_reason,
    error: upload.error,
  };

  switch (upload.stop_reason) {
    case "empty":
    case "completed":
      return { status: "completed", ...shared };
    case "business_rejection":
    case "conflict":
      return { status: "stopped", ...shared };
    case "transient_error":
      return { status: "transient_error", ...shared };
    case "no_session":
      return { status: "unauthenticated", ...shared };
    case "no_household":
      return { status: "no_household", ...shared };
  }
}

export async function syncHousehold(
  options?: SyncHouseholdOptions,
): Promise<SyncHouseholdResult> {
  const supabase = options?.supabase ?? createClient();
  const session = (await supabase.auth.getSession()).data.session;
  const userId = session?.user.id;
  if (!userId) {
    return idle("unauthenticated");
  }

  let memberships = await householdRepository.listMembershipsForUser(userId);
  if (memberships.length !== 1) {
    const ensure = options?.ensureLocalHousehold ?? ensureLocalHousehold;
    const ensured = await ensure({ userId });
    if (!ensured.ok) {
      if (ensured.code === "not_authenticated") {
        return idle("unauthenticated");
      }
      if (ensured.code === "transient_error") {
        return {
          status: "transient_error",
          household_id: null,
          uploaded_operation_ids: [],
          stopped_operation_id: null,
          stop_reason: "transient_error",
          error: { code: "transient_error", message: "hydrate failed" },
        };
      }
      return idle("no_household");
    }
    memberships = await householdRepository.listMembershipsForUser(userId);
    if (memberships.length !== 1) {
      return idle("no_household", ensured.household.id);
    }
  }

  const householdId = memberships[0].household_id;
  const existing = inflight.get(householdId);
  if (existing) {
    return existing;
  }

  const upload = options?.uploadPendingOperations ?? uploadPendingOperations;
  const reconcile = options?.reconcileHousehold ?? reconcileHousehold;
  const promise = uploadPendingOperationsForHousehold(
    householdId,
    supabase,
    upload,
    reconcile,
  ).finally(() => {
    if (inflight.get(householdId) === promise) {
      inflight.delete(householdId);
    }
  });
  inflight.set(householdId, promise);
  return promise;
}

async function persistSyncResult(
  householdId: string,
  result: SyncHouseholdResult,
  serverCursor?: string | null,
): Promise<void> {
  if (result.status === "completed") {
    const pending = await listPending(householdId);
    await syncMetadataRepository.recordSuccess(householdId, {
      hasPending: pending.length > 0,
      stopReason: result.stop_reason ?? "completed",
      lastServerCursor: serverCursor,
    });
    return;
  }

  if (result.status === "stopped" || result.status === "no_household") {
    await syncMetadataRepository.recordFailure(householdId, {
      kind: "business",
      code: result.error?.code ?? result.stop_reason,
      message: result.error?.message ?? result.stop_reason,
      stopReason: result.stop_reason ?? "business_rejection",
    });
    return;
  }

  if (result.status === "transient_error" || result.status === "unauthenticated") {
    await syncMetadataRepository.recordFailure(householdId, {
      kind: "transient",
      code: result.error?.code ?? result.stop_reason,
      message: result.error?.message ?? result.stop_reason,
      stopReason: result.stop_reason ?? "transient_error",
    });
  }
}

async function uploadPendingOperationsForHousehold(
  householdId: string,
  supabase: SupabaseClient,
  upload: typeof uploadPendingOperations,
  reconcile: (
    householdId: string,
    supabase: SupabaseClient,
  ) => Promise<ReconcileHouseholdResult>,
): Promise<SyncHouseholdResult> {
  await syncMetadataRepository.markAttemptStarted(householdId);
  const uploaded = await upload(householdId, { supabase });
  const result = mapUpload(householdId, uploaded);

  if (result.status === "completed") {
    const reconciled = await reconcile(householdId, supabase);
    if (!reconciled.ok) {
      const failed: SyncHouseholdResult = {
        ...result,
        status: "transient_error",
        stop_reason: "transient_error",
        error: {
          code: reconciled.code,
          message: reconciled.code,
        },
      };
      await persistSyncResult(householdId, failed);
      return failed;
    }
    await persistSyncResult(householdId, result, reconciled.server_cursor);
    return result;
  }

  await persistSyncResult(householdId, result);
  return result;
}
