import { getHouseholdDb } from "@/lib/db";
import type { InventoryOperation } from "@/lib/db";

export const inventoryOperationRepository = {
  async add(record: InventoryOperation): Promise<void> {
    await getHouseholdDb().inventory_operations.add(record);
  },
};
