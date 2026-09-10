import { categoryRepository } from "@/features/categories/repositories/category-repository";
import { productRepository } from "@/features/products/repositories/product-repository";
import { getHouseholdDb } from "@/lib/db";
import type { Category } from "@/lib/db";
import { validateCatalogName } from "@/lib/domain/catalog/name";
import { createOperationId } from "@/lib/sync/operation-id";
import { createPendingOperation, enqueue } from "@/lib/sync/outbox";

export type CategoryErrorCode =
  | "invalid_household"
  | "invalid_name"
  | "duplicate_name"
  | "not_found"
  | "category_in_use"
  | "persistence_failure";

export type CategoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: CategoryErrorCode };

export type CreateCategoryInput = {
  household_id: string;
  name: string;
};

export type RenameCategoryInput = {
  household_id: string;
  category_id: string;
  name: string;
};

export type ArchiveCategoryInput = {
  household_id: string;
  category_id: string;
};

function ok<T>(value: T): CategoryResult<T> {
  return { ok: true, value };
}

function fail<T = never>(code: CategoryErrorCode): CategoryResult<T> {
  return { ok: false, code };
}

function requireHousehold(householdId: string): CategoryErrorCode | null {
  return householdId.trim() === "" ? "invalid_household" : null;
}

function byName(left: Category, right: Category): number {
  return left.name.toLowerCase().localeCompare(right.name.toLowerCase());
}

async function nameTaken(
  householdId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await categoryRepository.list(householdId, { includeInactive: true });
  const needle = name.toLowerCase();
  return rows.some(
    (row) => row.id !== exceptId && row.name.toLowerCase() === needle,
  );
}

export async function createCategory(
  input: CreateCategoryInput,
): Promise<CategoryResult<Category>> {
  const household = requireHousehold(input.household_id);
  if (household) {
    return fail(household);
  }

  const name = validateCatalogName(input.name);
  if (!name.ok) {
    return fail("invalid_name");
  }

  const now = new Date().toISOString();
  const record: Category = {
    id: crypto.randomUUID(),
    household_id: input.household_id,
    name: name.value,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  const db = getHouseholdDb();
  try {
    return await db.transaction("rw", [db.categories, db.pending_operations], async () => {
      if (await nameTaken(input.household_id, name.value)) {
        return fail("duplicate_name");
      }
      await categoryRepository.put(record);
      await enqueue(
        createPendingOperation({
          household_id: input.household_id,
          operation_id: createOperationId(),
          operation_type: "CREATE_CATEGORY",
          payload: { id: record.id, name: record.name },
        }),
      );
      return ok(record);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function renameCategory(
  input: RenameCategoryInput,
): Promise<CategoryResult<Category>> {
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
    return await db.transaction("rw", [db.categories, db.pending_operations], async () => {
      const existing = await categoryRepository.getById(
        input.household_id,
        input.category_id,
      );
      if (!existing) {
        return fail("not_found");
      }
      if (await nameTaken(input.household_id, name.value, existing.id)) {
        return fail("duplicate_name");
      }

      const next: Category = {
        ...existing,
        name: name.value,
        updated_at: new Date().toISOString(),
      };
      await categoryRepository.put(next);
      await enqueue(
        createPendingOperation({
          household_id: input.household_id,
          operation_id: createOperationId(),
          operation_type: "RENAME_CATEGORY",
          payload: { id: next.id, name: next.name },
        }),
      );
      return ok(next);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function archiveCategory(
  input: ArchiveCategoryInput,
): Promise<CategoryResult<Category>> {
  const household = requireHousehold(input.household_id);
  if (household) {
    return fail(household);
  }

  const db = getHouseholdDb();
  try {
    return await db.transaction("rw", [db.categories, db.products, db.pending_operations], async () => {
      const existing = await categoryRepository.getById(
        input.household_id,
        input.category_id,
      );
      if (!existing) {
        return fail("not_found");
      }
      if (!existing.is_active) {
        return ok(existing);
      }

      const products = await productRepository.list(input.household_id, {
        includeInactive: true,
      });
      if (products.some((row) => row.category_id === existing.id)) {
        return fail("category_in_use");
      }

      const next: Category = {
        ...existing,
        is_active: false,
        updated_at: new Date().toISOString(),
      };
      await categoryRepository.put(next);
      await enqueue(
        createPendingOperation({
          household_id: input.household_id,
          operation_id: createOperationId(),
          operation_type: "ARCHIVE_CATEGORY",
          payload: { id: next.id },
        }),
      );
      return ok(next);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function listActiveCategories(
  householdId: string,
): Promise<Category[]> {
  if (householdId.trim() === "") {
    return [];
  }

  const rows = await categoryRepository.list(householdId);
  return rows.sort(byName);
}
