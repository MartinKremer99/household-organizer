import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { categoryRepository } from "@/features/categories/repositories/category-repository";
import { getHouseholdDb, resetHouseholdDbForTests } from "@/lib/db";
import type { Category } from "@/lib/db";
import {
  archiveProduct,
  changeProductCategory,
  changeProductMinimumStock,
  createProduct,
  listActiveProducts,
  renameProduct,
  searchActiveProducts,
} from "./manage-products";

const HOUSEHOLD_A = "household-a";
const HOUSEHOLD_B = "household-b";

function category(
  id: string,
  householdId: string,
  overrides: Partial<Category> = {},
): Category {
  return {
    id,
    household_id: householdId,
    name: id,
    is_active: true,
    created_at: "2026-09-09T10:00:00.000Z",
    updated_at: "2026-09-09T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
  await categoryRepository.put(category("category-a", HOUSEHOLD_A));
  await categoryRepository.put(category("category-b", HOUSEHOLD_A));
  await categoryRepository.put(category("category-other", HOUSEHOLD_B));
  await categoryRepository.put(
    category("category-archived", HOUSEHOLD_A, { is_active: false }),
  );
});

describe("manage-products", () => {
  it("creates a valid product, trims the name, and stores a null barcode", async () => {
    const created = await createProduct({
      household_id: HOUSEHOLD_A,
      name: "  Milk  ",
      category_id: "category-a",
      minimum_stock: 0,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.value.name).toBe("Milk");
    expect(created.value.barcode).toBeNull();
    expect(created.value.category_id).toBe("category-a");
    expect(created.value.minimum_stock).toBe(0);
  });

  it("persists a barcode and enqueues it on CREATE_PRODUCT", async () => {
    const created = await createProduct({
      household_id: HOUSEHOLD_A,
      name: "Milk",
      category_id: "category-a",
      minimum_stock: 0,
      barcode: " 5449000000996 ",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.value.barcode).toBe("5449000000996");
    expect(await getHouseholdDb().pending_operations.toArray()).toMatchObject([
      {
        operation_type: "CREATE_PRODUCT",
        payload: {
          id: created.value.id,
          name: "Milk",
          barcode: "5449000000996",
        },
      },
    ]);
  });

  it("rejects an invalid barcode and a household duplicate including archived products", async () => {
    expect(
      await createProduct({
        household_id: HOUSEHOLD_A,
        name: "Milk",
        category_id: "category-a",
        minimum_stock: 0,
        barcode: "abc",
      }),
    ).toEqual({ ok: false, code: "invalid_barcode" });

    const first = await createProduct({
      household_id: HOUSEHOLD_A,
      name: "Cola",
      category_id: "category-a",
      minimum_stock: 0,
      barcode: "5449000000996",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    await archiveProduct({
      household_id: HOUSEHOLD_A,
      product_id: first.value.id,
    });

    expect(
      await createProduct({
        household_id: HOUSEHOLD_A,
        name: "Diet cola",
        category_id: "category-a",
        minimum_stock: 0,
        barcode: "5449000000996",
      }),
    ).toEqual({ ok: false, code: "duplicate_barcode" });

    const other = await createProduct({
      household_id: HOUSEHOLD_B,
      name: "Cola",
      category_id: "category-other",
      minimum_stock: 0,
      barcode: "5449000000996",
    });
    expect(other.ok).toBe(true);
  });

  it("rejects an empty name", async () => {
    expect(
      await createProduct({
        household_id: HOUSEHOLD_A,
        name: "   ",
        category_id: "category-a",
        minimum_stock: 0,
      }),
    ).toEqual({ ok: false, code: "invalid_name" });
  });

  it("rejects a case-insensitive duplicate but allows the same name in another household", async () => {
    const first = await createProduct({
      household_id: HOUSEHOLD_A,
      name: "Milk",
      category_id: "category-a",
      minimum_stock: 0,
    });
    expect(first.ok).toBe(true);

    expect(
      await createProduct({
        household_id: HOUSEHOLD_A,
        name: "milk",
        category_id: "category-a",
        minimum_stock: 0,
      }),
    ).toEqual({ ok: false, code: "duplicate_name" });

    const other = await createProduct({
      household_id: HOUSEHOLD_B,
      name: "Milk",
      category_id: "category-other",
      minimum_stock: 0,
    });
    expect(other.ok).toBe(true);
  });

  it("rejects missing, foreign, and archived categories", async () => {
    expect(
      await createProduct({
        household_id: HOUSEHOLD_A,
        name: "Milk",
        category_id: "missing",
        minimum_stock: 0,
      }),
    ).toEqual({ ok: false, code: "invalid_category" });

    expect(
      await createProduct({
        household_id: HOUSEHOLD_A,
        name: "Milk",
        category_id: "category-other",
        minimum_stock: 0,
      }),
    ).toEqual({ ok: false, code: "invalid_category" });

    expect(
      await createProduct({
        household_id: HOUSEHOLD_A,
        name: "Milk",
        category_id: "category-archived",
        minimum_stock: 0,
      }),
    ).toEqual({ ok: false, code: "invalid_category" });
  });

  it("rejects invalid minimum stock", async () => {
    expect(
      await createProduct({
        household_id: HOUSEHOLD_A,
        name: "Milk",
        category_id: "category-a",
        minimum_stock: -1,
      }),
    ).toEqual({ ok: false, code: "invalid_minimum_stock" });

    expect(
      await createProduct({
        household_id: HOUSEHOLD_A,
        name: "Milk",
        category_id: "category-a",
        minimum_stock: 1.5,
      }),
    ).toEqual({ ok: false, code: "invalid_minimum_stock" });
  });

  it("renames a product and changes minimum stock", async () => {
    const created = await createProduct({
      household_id: HOUSEHOLD_A,
      name: "Milk",
      category_id: "category-a",
      minimum_stock: 0,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const renamed = await renameProduct({
      household_id: HOUSEHOLD_A,
      product_id: created.value.id,
      name: "Oat milk",
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    expect(renamed.value.name).toBe("Oat milk");

    const stocked = await changeProductMinimumStock({
      household_id: HOUSEHOLD_A,
      product_id: created.value.id,
      minimum_stock: 2,
    });
    expect(stocked.ok).toBe(true);
    if (!stocked.ok) {
      return;
    }
    expect(stocked.value.minimum_stock).toBe(2);
  });

  it("changes category on an archived product", async () => {
    const created = await createProduct({
      household_id: HOUSEHOLD_A,
      name: "Milk",
      category_id: "category-a",
      minimum_stock: 0,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const archived = await archiveProduct({
      household_id: HOUSEHOLD_A,
      product_id: created.value.id,
    });
    expect(archived.ok).toBe(true);

    const moved = await changeProductCategory({
      household_id: HOUSEHOLD_A,
      product_id: created.value.id,
      category_id: "category-b",
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) {
      return;
    }
    expect(moved.value.category_id).toBe("category-b");
    expect(moved.value.is_active).toBe(false);
  });

  it("archives a product and omits it from the active list", async () => {
    const created = await createProduct({
      household_id: HOUSEHOLD_A,
      name: "Milk",
      category_id: "category-a",
      minimum_stock: 0,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    await archiveProduct({
      household_id: HOUSEHOLD_A,
      product_id: created.value.id,
    });
    expect(await listActiveProducts(HOUSEHOLD_A)).toEqual([]);
  });

  it("searches active products and lists them by name", async () => {
    await createProduct({
      household_id: HOUSEHOLD_A,
      name: "Tomato sauce",
      category_id: "category-a",
      minimum_stock: 0,
    });
    await createProduct({
      household_id: HOUSEHOLD_A,
      name: "Milk",
      category_id: "category-a",
      minimum_stock: 0,
    });
    const archived = await createProduct({
      household_id: HOUSEHOLD_A,
      name: "Tomato paste",
      category_id: "category-a",
      minimum_stock: 0,
    });
    expect(archived.ok).toBe(true);
    if (archived.ok) {
      await archiveProduct({
        household_id: HOUSEHOLD_A,
        product_id: archived.value.id,
      });
    }

    expect((await listActiveProducts(HOUSEHOLD_A)).map((row) => row.name)).toEqual([
      "Milk",
      "Tomato sauce",
    ]);
    expect((await searchActiveProducts(HOUSEHOLD_A, "TOMATO")).map((row) => row.name)).toEqual([
      "Tomato sauce",
    ]);
    expect(await searchActiveProducts(HOUSEHOLD_A, "bread")).toEqual([]);
    expect(await searchActiveProducts(HOUSEHOLD_A, "   ")).toEqual([]);
  });

  it("has no React, Next, Supabase, or sync imports", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "manage-products.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
    expect(source).not.toMatch(/@\/lib\/supabase/);
    expect(source).not.toMatch(/createClient/);
    expect(source).toMatch(/@\/lib\/sync\/outbox/);
  });
});
