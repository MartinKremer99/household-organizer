import { getHouseholdDb } from "@/lib/db";
import type { InventoryLot } from "@/lib/db";

export const inventoryRepository = {
  async listLots(householdId: string): Promise<InventoryLot[]> {
    return getHouseholdDb()
      .inventory_lots.where("household_id")
      .equals(householdId)
      .toArray();
  },

  async listLotsForProduct(
    householdId: string,
    productId: string,
  ): Promise<InventoryLot[]> {
    const rows = await getHouseholdDb()
      .inventory_lots.where("household_id")
      .equals(householdId)
      .toArray();

    return rows.filter((row) => row.product_id === productId);
  },

  async listLotsForLocation(
    householdId: string,
    locationId: string,
  ): Promise<InventoryLot[]> {
    const rows = await getHouseholdDb()
      .inventory_lots.where("household_id")
      .equals(householdId)
      .toArray();

    return rows.filter((row) => row.location_id === locationId);
  },

  async listLotsForProductAtLocation(
    householdId: string,
    productId: string,
    locationId: string,
  ): Promise<InventoryLot[]> {
    const rows = await getHouseholdDb()
      .inventory_lots.where("household_id")
      .equals(householdId)
      .toArray();

    return rows.filter(
      (row) => row.product_id === productId && row.location_id === locationId,
    );
  },

  async listExpiringLots(
    householdId: string,
    onOrBefore: string,
  ): Promise<InventoryLot[]> {
    const rows = await getHouseholdDb()
      .inventory_lots.where("household_id")
      .equals(householdId)
      .toArray();

    return rows.filter(
      (row) =>
        row.expiration_date !== null && row.expiration_date <= onOrBefore,
    );
  },

  async totalQuantity(
    householdId: string,
    productId: string,
  ): Promise<number> {
    const lots = await inventoryRepository.listLotsForProduct(
      householdId,
      productId,
    );
    return lots.reduce((sum, lot) => sum + lot.quantity, 0);
  },

  async getLotById(
    householdId: string,
    lotId: string,
  ): Promise<InventoryLot | null> {
    const row = await getHouseholdDb().inventory_lots.get(lotId);
    if (!row || row.household_id !== householdId) {
      return null;
    }
    return row;
  },

  async putLot(lot: InventoryLot): Promise<void> {
    await getHouseholdDb().inventory_lots.put(lot);
  },
};
