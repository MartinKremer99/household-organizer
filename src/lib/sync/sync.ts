import type { SupabaseClient } from "@supabase/supabase-js";
import { householdRepository } from "@/features/household/repositories/household-repository";
import { createClient } from "@/lib/supabase/client";
import {
  uploadPendingOperations,
  type UploadPendingResult,
  type UploadStopReason,
} from "./uploader";

/**
 * Explicit household sync entry point.
 * Resolves session + exactly one local membership, then uploads that outbox.
 * Concurrent calls for the same household share one in-flight Promise.
 * No timers, reconnect listeners, Realtime, or reconciliation.
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

  const memberships = await householdRepository.listMembershipsForUser(userId);
  if (memberships.length !== 1) {
    return idle("no_household");
  }

  const householdId = memberships[0].household_id;
  const existing = inflight.get(householdId);
  if (existing) {
    return existing;
  }

  const upload = options?.uploadPendingOperations ?? uploadPendingOperations;
  const promise = uploadPendingOperationsForHousehold(
    householdId,
    supabase,
    upload,
  ).finally(() => {
    if (inflight.get(householdId) === promise) {
      inflight.delete(householdId);
    }
  });
  inflight.set(householdId, promise);
  return promise;
}

async function uploadPendingOperationsForHousehold(
  householdId: string,
  supabase: SupabaseClient,
  upload: typeof uploadPendingOperations,
): Promise<SyncHouseholdResult> {
  const uploaded = await upload(householdId, { supabase });
  return mapUpload(householdId, uploaded);
}
