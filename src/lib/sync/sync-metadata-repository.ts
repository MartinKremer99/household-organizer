import { getHouseholdDb } from "@/lib/db";
import type { SyncMetadata } from "@/lib/db";

export const syncMetadataRepository = {
  async get(householdId: string): Promise<SyncMetadata | null> {
    const row = await getHouseholdDb().sync_metadata.get(householdId);
    return row ?? null;
  },

  async upsert(record: SyncMetadata): Promise<void> {
    await getHouseholdDb().sync_metadata.put(record);
  },
};
