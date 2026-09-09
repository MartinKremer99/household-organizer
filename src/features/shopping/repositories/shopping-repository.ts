import Dexie from "dexie";
import { getHouseholdDb } from "@/lib/db";
import type { ShoppingItem, ShoppingItemStatus } from "@/lib/db";

export const shoppingRepository = {
  async listByStatus(
    householdId: string,
    status: ShoppingItemStatus,
  ): Promise<ShoppingItem[]> {
    return getHouseholdDb()
      .shopping_items.where("[household_id+status]")
      .equals([householdId, status])
      .toArray();
  },

  async getById(
    householdId: string,
    id: string,
  ): Promise<ShoppingItem | null> {
    const row = await getHouseholdDb().shopping_items.get(id);
    if (!row || row.household_id !== householdId) {
      return null;
    }
    return row;
  },

  async listForProduct(
    householdId: string,
    productId: string,
  ): Promise<ShoppingItem[]> {
    const rows = await getHouseholdDb()
      .shopping_items.where("product_id")
      .equals(productId)
      .toArray();

    return rows.filter((row) => row.household_id === householdId);
  },

  async listFreeText(householdId: string): Promise<ShoppingItem[]> {
    const rows = await getHouseholdDb()
      .shopping_items.where("[household_id+status]")
      .between([householdId, Dexie.minKey], [householdId, Dexie.maxKey])
      .toArray();

    return rows.filter((row) => row.free_text !== null);
  },

  async put(item: ShoppingItem): Promise<void> {
    await getHouseholdDb().shopping_items.put(item);
  },
};
