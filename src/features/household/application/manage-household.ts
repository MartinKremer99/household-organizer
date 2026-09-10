import { householdRepository } from "@/features/household/repositories/household-repository";
import { getHouseholdDb } from "@/lib/db";
import type { Household } from "@/lib/db";
import { validateHouseholdName } from "@/lib/domain/household/name";
import { createOperationId } from "@/lib/sync/operation-id";
import { createPendingOperation, enqueue } from "@/lib/sync/outbox";

export type HouseholdErrorCode =
  | "invalid_household"
  | "invalid_name"
  | "persistence_failure";

export type HouseholdResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: HouseholdErrorCode };

export type RenameHouseholdInput = {
  householdId: string;
  name: string;
};

function ok<T>(value: T): HouseholdResult<T> {
  return { ok: true, value };
}

function fail<T = never>(code: HouseholdErrorCode): HouseholdResult<T> {
  return { ok: false, code };
}

export async function getLocalHousehold(): Promise<Household | null> {
  const members = await getHouseholdDb().household_members.toArray();
  if (members.length !== 1) {
    return null;
  }

  return householdRepository.getById(members[0].household_id);
}

export async function renameHousehold(
  input: RenameHouseholdInput,
): Promise<HouseholdResult<Household>> {
  const name = validateHouseholdName(input.name);
  if (!name.ok) {
    return fail("invalid_name");
  }

  const local = await getLocalHousehold();
  if (!local || local.id !== input.householdId) {
    return fail("invalid_household");
  }

  if (local.name === name.value) {
    return ok(local);
  }

  const next: Household = {
    ...local,
    name: name.value,
    updated_at: new Date().toISOString(),
  };

  const db = getHouseholdDb();
  try {
    return await db.transaction(
      "rw",
      [db.households, db.pending_operations],
      async () => {
        await householdRepository.put(next);
        await enqueue(
          createPendingOperation({
            household_id: next.id,
            operation_id: createOperationId(),
            operation_type: "RENAME_HOUSEHOLD",
            payload: { name: next.name },
          }),
        );
        return ok(next);
      },
    );
  } catch {
    return fail("persistence_failure");
  }
}
