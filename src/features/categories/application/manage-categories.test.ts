import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { productRepository } from "@/features/products/repositories/product-repository";
import { resetHouseholdDbForTests } from "@/lib/db";
import type { Product } from "@/lib/db";
import {
  archiveCategory,
  createCategory,
  listActiveCategories,
  renameCategory,
} from "./manage-categories";

const HOUSEHOLD_A = "household-a";

function product(overrides: Partial<Product> & Pick<Product, "id" | "category_id">): Product {
  return {
    household_id: HOUSEHOLD_A,
    name: overrides.name ?? overrides.id,
    minimum_stock: 0,
    barcode: null,
    is_active: true,
    created_at: "2026-09-09T10:00:00.000Z",
    updated_at: "2026-09-09T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe("manage-categories", () => {
  it("creates a valid category and trims the name", async () => {
    const created = await createCategory({
      household_id: HOUSEHOLD_A,
      name: "  Food  ",
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.value.name).toBe("Food");
    expect(created.value.is_active).toBe(true);
    expect(created.value.household_id).toBe(HOUSEHOLD_A);
    expect(await listActiveCategories(HOUSEHOLD_A)).toEqual([created.value]);
  });

  it("rejects an empty name", async () => {
    expect(
      await createCategory({ household_id: HOUSEHOLD_A, name: "   " }),
    ).toEqual({ ok: false, code: "invalid_name" });
  });

  it("rejects a case-insensitive duplicate including archived names", async () => {
    const first = await createCategory({ household_id: HOUSEHOLD_A, name: "Food" });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    expect(
      await createCategory({ household_id: HOUSEHOLD_A, name: "food" }),
    ).toEqual({ ok: false, code: "duplicate_name" });

    await archiveCategory({
      household_id: HOUSEHOLD_A,
      category_id: first.value.id,
    });

    expect(
      await createCategory({ household_id: HOUSEHOLD_A, name: "FOOD" }),
    ).toEqual({ ok: false, code: "duplicate_name" });
  });

  it("renames a category and allows a case-only change on the same id", async () => {
    const created = await createCategory({
      household_id: HOUSEHOLD_A,
      name: "food",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const renamed = await renameCategory({
      household_id: HOUSEHOLD_A,
      category_id: created.value.id,
      name: "Food",
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    expect(renamed.value.name).toBe("Food");
    expect(renamed.value.id).toBe(created.value.id);
  });

  it("archives a category and omits it from the active list", async () => {
    const created = await createCategory({
      household_id: HOUSEHOLD_A,
      name: "Food",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const archived = await archiveCategory({
      household_id: HOUSEHOLD_A,
      category_id: created.value.id,
    });
    expect(archived.ok).toBe(true);
    if (!archived.ok) {
      return;
    }
    expect(archived.value.is_active).toBe(false);
    expect(await listActiveCategories(HOUSEHOLD_A)).toEqual([]);

    const again = await archiveCategory({
      household_id: HOUSEHOLD_A,
      category_id: created.value.id,
    });
    expect(again).toEqual(archived);
  });

  it("blocks archive when any product still references the category", async () => {
    const created = await createCategory({
      household_id: HOUSEHOLD_A,
      name: "Food",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    await productRepository.put(
      product({ id: "product-active", category_id: created.value.id }),
    );
    expect(
      await archiveCategory({
        household_id: HOUSEHOLD_A,
        category_id: created.value.id,
      }),
    ).toEqual({ ok: false, code: "category_in_use" });

    await productRepository.put(
      product({
        id: "product-active",
        category_id: created.value.id,
        is_active: false,
      }),
    );
    expect(
      await archiveCategory({
        household_id: HOUSEHOLD_A,
        category_id: created.value.id,
      }),
    ).toEqual({ ok: false, code: "category_in_use" });
  });

  it("lists active categories by name", async () => {
    await createCategory({ household_id: HOUSEHOLD_A, name: "Snacks" });
    await createCategory({ household_id: HOUSEHOLD_A, name: "Drinks" });

    expect((await listActiveCategories(HOUSEHOLD_A)).map((row) => row.name)).toEqual([
      "Drinks",
      "Snacks",
    ]);
  });

  it("has no React, Next, Supabase, or sync imports", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "manage-categories.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']react(?:\/|["'])/);
    expect(source).not.toMatch(/@\/lib\/supabase/);
    expect(source).not.toMatch(/@\/lib\/sync/);
    expect(source).not.toMatch(/outbox/);
    expect(source).not.toMatch(/createClient/);
  });
});
