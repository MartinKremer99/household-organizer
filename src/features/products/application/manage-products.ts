import { categoryRepository } from "@/features/categories/repositories/category-repository";
import { productRepository } from "@/features/products/repositories/product-repository";
import { getHouseholdDb } from "@/lib/db";
import type { Product } from "@/lib/db";
import { validateCatalogName } from "@/lib/domain/catalog/name";
import { validateMinimumStock } from "@/lib/domain/products/minimum-stock";
import { createOperationId } from "@/lib/sync/operation-id";
import { createPendingOperation, enqueue } from "@/lib/sync/outbox";

export type ProductErrorCode =
  | "invalid_household"
  | "invalid_name"
  | "duplicate_name"
  | "not_found"
  | "invalid_category"
  | "invalid_minimum_stock"
  | "persistence_failure";

export type ProductResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProductErrorCode };

export type CreateProductInput = {
  household_id: string;
  name: string;
  category_id: string;
  minimum_stock: number;
  barcode?: string | null;
};

export type RenameProductInput = {
  household_id: string;
  product_id: string;
  name: string;
};

export type ChangeProductCategoryInput = {
  household_id: string;
  product_id: string;
  category_id: string;
};

export type ChangeProductMinimumStockInput = {
  household_id: string;
  product_id: string;
  minimum_stock: number;
};

export type ArchiveProductInput = {
  household_id: string;
  product_id: string;
};

function ok<T>(value: T): ProductResult<T> {
  return { ok: true, value };
}

function fail<T = never>(code: ProductErrorCode): ProductResult<T> {
  return { ok: false, code };
}

function requireHousehold(householdId: string): ProductErrorCode | null {
  return householdId.trim() === "" ? "invalid_household" : null;
}

function byName(left: Product, right: Product): number {
  return left.name.toLowerCase().localeCompare(right.name.toLowerCase());
}

function normalizeBarcode(barcode: string | null | undefined): string | null {
  if (barcode == null) {
    return null;
  }
  const trimmed = barcode.trim();
  return trimmed.length === 0 ? null : trimmed;
}

async function nameTaken(
  householdId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await productRepository.list(householdId, { includeInactive: true });
  const needle = name.toLowerCase();
  return rows.some(
    (row) => row.id !== exceptId && row.name.toLowerCase() === needle,
  );
}

async function requireActiveCategory(
  householdId: string,
  categoryId: string,
): Promise<ProductErrorCode | null> {
  const category = await categoryRepository.getById(householdId, categoryId);
  if (!category || !category.is_active) {
    return "invalid_category";
  }
  return null;
}

export async function createProduct(
  input: CreateProductInput,
): Promise<ProductResult<Product>> {
  const household = requireHousehold(input.household_id);
  if (household) {
    return fail(household);
  }

  const name = validateCatalogName(input.name);
  if (!name.ok) {
    return fail("invalid_name");
  }

  const minimum = validateMinimumStock(input.minimum_stock);
  if (!minimum.ok) {
    return fail("invalid_minimum_stock");
  }

  const db = getHouseholdDb();
  try {
    return await db.transaction("rw", [db.products, db.categories, db.pending_operations], async () => {
      const categoryError = await requireActiveCategory(
        input.household_id,
        input.category_id,
      );
      if (categoryError) {
        return fail(categoryError);
      }
      if (await nameTaken(input.household_id, name.value)) {
        return fail("duplicate_name");
      }

      const now = new Date().toISOString();
      const record: Product = {
        id: crypto.randomUUID(),
        household_id: input.household_id,
        name: name.value,
        category_id: input.category_id,
        minimum_stock: minimum.value,
        barcode: normalizeBarcode(input.barcode),
        is_active: true,
        created_at: now,
        updated_at: now,
      };
      await productRepository.put(record);
      await enqueue(
        createPendingOperation({
          household_id: input.household_id,
          operation_id: createOperationId(),
          operation_type: "CREATE_PRODUCT",
          payload: {
            id: record.id,
            name: record.name,
            category_id: record.category_id,
            minimum_stock: record.minimum_stock,
            barcode: record.barcode,
          },
        }),
      );
      return ok(record);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function renameProduct(
  input: RenameProductInput,
): Promise<ProductResult<Product>> {
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
    return await db.transaction("rw", [db.products, db.pending_operations], async () => {
      const existing = await productRepository.getById(
        input.household_id,
        input.product_id,
      );
      if (!existing) {
        return fail("not_found");
      }
      if (await nameTaken(input.household_id, name.value, existing.id)) {
        return fail("duplicate_name");
      }

      const next: Product = {
        ...existing,
        name: name.value,
        updated_at: new Date().toISOString(),
      };
      await productRepository.put(next);
      await enqueue(
        createPendingOperation({
          household_id: input.household_id,
          operation_id: createOperationId(),
          operation_type: "RENAME_PRODUCT",
          payload: { id: next.id, name: next.name },
        }),
      );
      return ok(next);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function changeProductCategory(
  input: ChangeProductCategoryInput,
): Promise<ProductResult<Product>> {
  const household = requireHousehold(input.household_id);
  if (household) {
    return fail(household);
  }

  const db = getHouseholdDb();
  try {
    return await db.transaction(
      "rw",
      [db.products, db.categories, db.pending_operations],
      async () => {
      const existing = await productRepository.getById(
        input.household_id,
        input.product_id,
      );
      if (!existing) {
        return fail("not_found");
      }

      const categoryError = await requireActiveCategory(
        input.household_id,
        input.category_id,
      );
      if (categoryError) {
        return fail(categoryError);
      }

      const next: Product = {
        ...existing,
        category_id: input.category_id,
        updated_at: new Date().toISOString(),
      };
      await productRepository.put(next);
      await enqueue(
        createPendingOperation({
          household_id: input.household_id,
          operation_id: createOperationId(),
          operation_type: "CHANGE_PRODUCT_CATEGORY",
          payload: { id: next.id, category_id: next.category_id },
        }),
      );
      return ok(next);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function changeProductMinimumStock(
  input: ChangeProductMinimumStockInput,
): Promise<ProductResult<Product>> {
  const household = requireHousehold(input.household_id);
  if (household) {
    return fail(household);
  }

  const minimum = validateMinimumStock(input.minimum_stock);
  if (!minimum.ok) {
    return fail("invalid_minimum_stock");
  }

  const db = getHouseholdDb();
  try {
    return await db.transaction("rw", [db.products, db.pending_operations], async () => {
      const existing = await productRepository.getById(
        input.household_id,
        input.product_id,
      );
      if (!existing) {
        return fail("not_found");
      }

      const next: Product = {
        ...existing,
        minimum_stock: minimum.value,
        updated_at: new Date().toISOString(),
      };
      await productRepository.put(next);
      await enqueue(
        createPendingOperation({
          household_id: input.household_id,
          operation_id: createOperationId(),
          operation_type: "CHANGE_PRODUCT_MINIMUM_STOCK",
          payload: { id: next.id, minimum_stock: next.minimum_stock },
        }),
      );
      return ok(next);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function archiveProduct(
  input: ArchiveProductInput,
): Promise<ProductResult<Product>> {
  const household = requireHousehold(input.household_id);
  if (household) {
    return fail(household);
  }

  const db = getHouseholdDb();
  try {
    return await db.transaction("rw", [db.products, db.pending_operations], async () => {
      const existing = await productRepository.getById(
        input.household_id,
        input.product_id,
      );
      if (!existing) {
        return fail("not_found");
      }
      if (!existing.is_active) {
        return ok(existing);
      }

      const next: Product = {
        ...existing,
        is_active: false,
        updated_at: new Date().toISOString(),
      };
      await productRepository.put(next);
      await enqueue(
        createPendingOperation({
          household_id: input.household_id,
          operation_id: createOperationId(),
          operation_type: "ARCHIVE_PRODUCT",
          payload: { id: next.id },
        }),
      );
      return ok(next);
    });
  } catch {
    return fail("persistence_failure");
  }
}

export async function listActiveProducts(householdId: string): Promise<Product[]> {
  if (householdId.trim() === "") {
    return [];
  }

  const rows = await productRepository.list(householdId);
  return rows.sort(byName);
}

export async function searchActiveProducts(
  householdId: string,
  query: string,
): Promise<Product[]> {
  if (householdId.trim() === "") {
    return [];
  }

  const rows = await productRepository.search(householdId, query);
  return rows.sort(byName);
}
