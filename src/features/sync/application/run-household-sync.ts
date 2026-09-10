import { triggerHouseholdSync } from "@/lib/sync/trigger";

export async function runHouseholdSync(): Promise<void> {
  await triggerHouseholdSync();
}
