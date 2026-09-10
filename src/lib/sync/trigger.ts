import {
  syncHousehold,
  type SyncHouseholdOptions,
  type SyncHouseholdResult,
} from "./sync";

/**
 * Application-level explicit sync request.
 * Delegates to syncHousehold. No timers, reconnect, Realtime, or auto-invoke.
 */

export type TriggerHouseholdSyncOptions = SyncHouseholdOptions & {
  syncHousehold?: typeof syncHousehold;
};

export async function triggerHouseholdSync(
  options?: TriggerHouseholdSyncOptions,
): Promise<SyncHouseholdResult> {
  const sync = options?.syncHousehold ?? syncHousehold;
  const coordinatorOptions = { ...options };
  delete coordinatorOptions.syncHousehold;
  return sync(coordinatorOptions);
}
