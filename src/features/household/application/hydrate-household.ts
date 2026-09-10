import { householdRepository } from "@/features/household/repositories/household-repository";
import { HOUSEHOLD_DB_VERSION, getHouseholdDb } from "@/lib/db";
import type {
  Category,
  Household,
  HouseholdMember,
  InventoryLot,
  InventoryOperation,
  Location,
  Product,
  PurchasedStock,
  ShoppingItem,
} from "@/lib/db";
import { syncMetadataRepository } from "@/lib/sync/sync-metadata-repository";

export type HouseholdSnapshot = {
  household: Household;
  membership: HouseholdMember;
  categories: Category[];
  locations: Location[];
  products: Product[];
  inventory_lots: InventoryLot[];
  inventory_operations: InventoryOperation[];
  purchased_stock: PurchasedStock[];
  shopping_items: ShoppingItem[];
  server_cursor: string;
};

export type PullHouseholdStateResult =
  | { ok: true; snapshot: HouseholdSnapshot }
  | { ok: false; code: "not_authenticated" | "no_household" | "transient_error" };

export type EnsureLocalHouseholdResult =
  | { ok: true; household: Household }
  | { ok: false; code: "not_authenticated" | "no_household" | "transient_error" };

export type EnsureLocalHouseholdOptions = {
  userId: string;
  pullHouseholdState?: () => Promise<PullHouseholdStateResult>;
};

async function defaultPullHouseholdState(): Promise<PullHouseholdStateResult> {
  const { pullHouseholdState } = await import("@/lib/sync/reconcile");
  return pullHouseholdState();
}

async function replaceHouseholdRows<T extends { id: string; household_id: string }>(
  table: {
    where: (key: string) => { equals: (value: string) => { toArray: () => Promise<T[]> } };
    bulkPut: (rows: T[]) => Promise<unknown>;
    delete: (id: string) => Promise<unknown>;
  },
  householdId: string,
  rows: T[],
): Promise<void> {
  const keep = new Set(rows.map((row) => row.id));
  const existing = await table.where("household_id").equals(householdId).toArray();
  await Promise.all(
    existing
      .filter((row) => !keep.has(row.id))
      .map((row) => table.delete(row.id)),
  );
  if (rows.length > 0) {
    await table.bulkPut(rows);
  }
}

export async function applyHouseholdSnapshot(
  snapshot: HouseholdSnapshot,
): Promise<void> {
  const householdId = snapshot.household.id;
  const db = getHouseholdDb();

  await db.transaction(
    "rw",
    [
      db.households,
      db.household_members,
      db.categories,
      db.locations,
      db.products,
      db.inventory_lots,
      db.inventory_operations,
      db.purchased_stock,
      db.shopping_items,
      db.sync_metadata,
    ],
    async () => {
      await db.households.put(snapshot.household);

      const members = await db.household_members.toArray();
      await Promise.all(
        members
          .filter(
            (row) =>
              row.user_id === snapshot.membership.user_id &&
              row.household_id !== householdId,
          )
          .map((row) => db.household_members.delete([row.household_id, row.user_id])),
      );

      const householdMembers = await db.household_members
        .where("household_id")
        .equals(householdId)
        .toArray();
      await Promise.all(
        householdMembers
          .filter(
            (row) =>
              row.user_id !== snapshot.membership.user_id ||
              row.household_id !== snapshot.membership.household_id,
          )
          .map((row) => db.household_members.delete([row.household_id, row.user_id])),
      );
      await db.household_members.put(snapshot.membership);

      await replaceHouseholdRows(db.categories, householdId, snapshot.categories);
      await replaceHouseholdRows(db.locations, householdId, snapshot.locations);
      await replaceHouseholdRows(db.products, householdId, snapshot.products);
      await replaceHouseholdRows(db.inventory_lots, householdId, snapshot.inventory_lots);
      await replaceHouseholdRows(
        db.inventory_operations,
        householdId,
        snapshot.inventory_operations,
      );
      await replaceHouseholdRows(
        db.purchased_stock,
        householdId,
        snapshot.purchased_stock,
      );
      await replaceHouseholdRows(db.shopping_items, householdId, snapshot.shopping_items);

      const existing = await syncMetadataRepository.get(householdId);
      await syncMetadataRepository.upsert({
        household_id: householdId,
        last_sync_at: existing?.last_sync_at ?? null,
        last_attempt_at: existing?.last_attempt_at ?? null,
        last_status: existing?.last_status ?? "never_synced",
        last_error_kind: existing?.last_error_kind ?? null,
        last_error_code: existing?.last_error_code ?? null,
        last_error_message: existing?.last_error_message ?? null,
        last_stop_reason: existing?.last_stop_reason ?? null,
        last_server_cursor: snapshot.server_cursor,
        schema_version: existing?.schema_version ?? HOUSEHOLD_DB_VERSION,
      });
    },
  );
}

export async function ensureLocalHousehold(
  options: EnsureLocalHouseholdOptions,
): Promise<EnsureLocalHouseholdResult> {
  const userId = options.userId.trim();
  if (!userId) {
    return { ok: false, code: "not_authenticated" };
  }

  const memberships = await householdRepository.listMembershipsForUser(userId);
  if (memberships.length === 1) {
    const existing = await householdRepository.getById(memberships[0].household_id);
    if (existing) {
      return { ok: true, household: existing };
    }
  }

  const pull = options.pullHouseholdState ?? defaultPullHouseholdState;
  const pulled = await pull();
  if (!pulled.ok) {
    return { ok: false, code: pulled.code };
  }

  await applyHouseholdSnapshot(pulled.snapshot);
  return { ok: true, household: pulled.snapshot.household };
}
