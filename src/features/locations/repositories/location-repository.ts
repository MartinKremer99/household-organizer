import { getHouseholdDb } from "@/lib/db";
import type { Location } from "@/lib/db";

type ListOptions = { includeInactive?: boolean };

export const locationRepository = {
  async list(
    householdId: string,
    options?: ListOptions,
  ): Promise<Location[]> {
    const rows = await getHouseholdDb()
      .locations.where("household_id")
      .equals(householdId)
      .toArray();

    const scoped = options?.includeInactive
      ? rows
      : rows.filter((row) => row.is_active);

    return scoped.sort((a, b) => a.sort_order - b.sort_order);
  },

  async getById(householdId: string, id: string): Promise<Location | null> {
    const row = await getHouseholdDb().locations.get(id);
    if (!row || row.household_id !== householdId) {
      return null;
    }
    return row;
  },

  async put(record: Location): Promise<void> {
    await getHouseholdDb().locations.put(record);
  },
};
