import { getHouseholdDb } from "@/lib/db";
import type { Category } from "@/lib/db";

type ListOptions = { includeInactive?: boolean };

export const categoryRepository = {
  async list(
    householdId: string,
    options?: ListOptions,
  ): Promise<Category[]> {
    const rows = await getHouseholdDb()
      .categories.where("household_id")
      .equals(householdId)
      .toArray();

    if (options?.includeInactive) {
      return rows;
    }

    return rows.filter((row) => row.is_active);
  },

  async getById(householdId: string, id: string): Promise<Category | null> {
    const row = await getHouseholdDb().categories.get(id);
    if (!row || row.household_id !== householdId) {
      return null;
    }
    return row;
  },

  async put(record: Category): Promise<void> {
    await getHouseholdDb().categories.put(record);
  },
};
