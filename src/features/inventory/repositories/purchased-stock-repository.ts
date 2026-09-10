import { getHouseholdDb } from "@/lib/db";
import type { PurchasedStock } from "@/lib/db";

export const purchasedStockRepository = {
  async list(householdId: string): Promise<PurchasedStock[]> {
    return getHouseholdDb()
      .purchased_stock.where("household_id")
      .equals(householdId)
      .toArray();
  },

  async listForProduct(
    householdId: string,
    productId: string,
  ): Promise<PurchasedStock[]> {
    const rows = await getHouseholdDb()
      .purchased_stock.where("household_id")
      .equals(householdId)
      .toArray();

    return rows.filter((row) => row.product_id === productId);
  },

  async put(record: PurchasedStock): Promise<void> {
    await getHouseholdDb().purchased_stock.put(record);
  },

  async delete(householdId: string, id: string): Promise<void> {
    const row = await getHouseholdDb().purchased_stock.get(id);
    if (!row || row.household_id !== householdId) {
      return;
    }
    await getHouseholdDb().purchased_stock.delete(id);
  },
};
