import { locationRepository } from "@/features/locations/repositories/location-repository";
import { getHouseholdDb } from "@/lib/db";
import type { Location } from "@/lib/db";
import { validateCatalogName } from "@/lib/domain/catalog/name";

export type LocationErrorCode =
  | "invalid_household"
  | "invalid_name"
  | "duplicate_name"
  | "not_found"
  | "persistence_failure";

export type LocationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: LocationErrorCode };

export type CreateLocationInput = {
  household_id: string;
  name: string;
};

export type RenameLocationInput = {
  household_id: string;
  location_id: string;
  name: string;
};

export type ArchiveLocationInput = {
  household_id: string;
  location_id: string;
};

function ok<T>(value: T): LocationResult<T> {
  return { ok: true, value };
}

function fail<T = never>(code: LocationErrorCode): LocationResult<T> {
  return { ok: false, code };
}

function requireHousehold(householdId: string): LocationErrorCode | null {
  return householdId.trim() === "" ? "invalid_household" : null;
}

function byOrderThenName(left: Location, right: Location): number {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }
  return left.name.toLowerCase().localeCompare(right.name.toLowerCase());
}

async function nameTaken(
  householdId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await locationRepository.list(householdId, { includeInactive: true });
  const needle = name.toLowerCase();
  return rows.some(
    (row) => row.id !== exceptId && row.name.toLowerCase() === needle,
  );
}

export async function createLocation(
  input: CreateLocationInput,
): Promise<LocationResult<Location>> {
  const household = requireHousehold(input.household_id);
  if (household) {
    return fail(household);
  }

  const name = validateCatalogName(input.name);
  if (!name.ok) {
    return fail("invalid_name");
  }

  const db = getHouseholdDb();
  try {
    return await db.transaction("rw", [db.locations], async () => {
      if (await nameTaken(input.household_id, name.value)) {
        return fail("duplicate_name");
      }

      const existing = await locationRepository.list(input.household_id, {
        includeInactive: true,
      });
      const sort_order =
        existing.length === 0
          ? 0
          : Math.max(...existing.map((row) => row.sort_order)) + 1;
      const now = new Date().toISOString();
      const record: Location = {
        id: crypto.randomUUID(),
        household_id: input.household_id,
        name: name.value,
        is_active: true,
        sort_order,
        created_at: now,
        updated_at: now,
      };
      await locationRepository.put(record);
      return ok(record);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function renameLocation(
  input: RenameLocationInput,
): Promise<LocationResult<Location>> {
  const household = requireHousehold(input.household_id);
  if (household) {
    return fail(household);
  }

  const name = validateCatalogName(input.name);
  if (!name.ok) {
    return fail("invalid_name");
  }

  const db = getHouseholdDb();
  try {
    return await db.transaction("rw", [db.locations], async () => {
      const existing = await locationRepository.getById(
        input.household_id,
        input.location_id,
      );
      if (!existing) {
        return fail("not_found");
      }
      if (await nameTaken(input.household_id, name.value, existing.id)) {
        return fail("duplicate_name");
      }

      const next: Location = {
        ...existing,
        name: name.value,
        updated_at: new Date().toISOString(),
      };
      await locationRepository.put(next);
      return ok(next);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function archiveLocation(
  input: ArchiveLocationInput,
): Promise<LocationResult<Location>> {
  const household = requireHousehold(input.household_id);
  if (household) {
    return fail(household);
  }

  const db = getHouseholdDb();
  try {
    return await db.transaction("rw", [db.locations], async () => {
      const existing = await locationRepository.getById(
        input.household_id,
        input.location_id,
      );
      if (!existing) {
        return fail("not_found");
      }
      if (!existing.is_active) {
        return ok(existing);
      }

      const next: Location = {
        ...existing,
        is_active: false,
        updated_at: new Date().toISOString(),
      };
      await locationRepository.put(next);
      return ok(next);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function listActiveLocations(
  householdId: string,
): Promise<Location[]> {
  if (householdId.trim() === "") {
    return [];
  }

  const rows = await locationRepository.list(householdId);
  return rows.sort(byOrderThenName);
}
