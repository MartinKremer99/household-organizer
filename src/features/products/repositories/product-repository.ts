import { getHouseholdDb } from "@/lib/db";
import type { Product } from "@/lib/db";

type ListOptions = {
  includeInactive?: boolean;
  categoryId?: string;
};

function applyProductFilters(
  rows: Product[],
  options?: ListOptions,
): Product[] {
  let result = rows;

  if (options?.categoryId) {
    result = result.filter((row) => row.category_id === options.categoryId);
  }

  if (!options?.includeInactive) {
    result = result.filter((row) => row.is_active);
  }

  return result;
}

export const productRepository = {
  async list(
    householdId: string,
    options?: ListOptions,
  ): Promise<Product[]> {
    const rows = await getHouseholdDb()
      .products.where("household_id")
      .equals(householdId)
      .toArray();

    return applyProductFilters(rows, options);
  },

  async getById(householdId: string, id: string): Promise<Product | null> {
    const row = await getHouseholdDb().products.get(id);
    if (!row || row.household_id !== householdId) {
      return null;
    }
    return row;
  },

  async search(
    householdId: string,
    query: string,
    options?: { includeInactive?: boolean },
  ): Promise<Product[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }

    const rows = await getHouseholdDb()
      .products.where("household_id")
      .equals(householdId)
      .toArray();

    return applyProductFilters(rows, options).filter((row) =>
      row.name.toLowerCase().includes(needle),
    );
  },

  async put(product: Product): Promise<void> {
    await getHouseholdDb().products.put(product);
  },
};
