/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductsScreen, type ProductsScreenApi } from "./products-screen";

const HOUSEHOLD = "household-a";

const category = {
  id: "cat-1",
  household_id: HOUSEHOLD,
  name: "Food",
  is_active: true,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
};

const household = {
  id: "cat-2",
  household_id: HOUSEHOLD,
  name: "Household",
  is_active: true,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
};

const milk = {
  id: "prod-1",
  household_id: HOUSEHOLD,
  name: "Milk",
  category_id: "cat-1",
  minimum_stock: 2,
  barcode: null,
  is_active: true,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
};

function api(overrides: Partial<ProductsScreenApi> = {}): ProductsScreenApi {
  return {
    listActiveProducts: vi.fn().mockResolvedValue([milk]),
    searchActiveProducts: vi.fn().mockResolvedValue([milk]),
    listActiveCategories: vi.fn().mockResolvedValue([category, household]),
    createProduct: vi.fn().mockResolvedValue({ ok: true, value: milk }),
    renameProduct: vi.fn().mockResolvedValue({ ok: true, value: milk }),
    changeProductCategory: vi.fn().mockResolvedValue({ ok: true, value: milk }),
    changeProductMinimumStock: vi.fn().mockResolvedValue({ ok: true, value: milk }),
    archiveProduct: vi.fn().mockResolvedValue({ ok: true, value: { ...milk, is_active: false } }),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("ProductsScreen", () => {
  it("renders product name, category, and minimum stock", async () => {
    render(<ProductsScreen householdId={HOUSEHOLD} api={api()} />);

    expect(await screen.findByRole("heading", { name: "Milk" })).toBeTruthy();
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Min 2")).toBeTruthy();
  });

  it("searches through the application function", async () => {
    const catalog = api();
    render(<ProductsScreen householdId={HOUSEHOLD} api={catalog} />);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.change(screen.getByLabelText("Search products"), {
      target: { value: "tom" },
    });

    await waitFor(() => {
      expect(catalog.searchActiveProducts).toHaveBeenCalledWith(HOUSEHOLD, "tom");
    });
  });

  it("creates a product through the application function", async () => {
    const catalog = api({
      listActiveProducts: vi.fn().mockResolvedValue([]),
    });
    render(<ProductsScreen householdId={HOUSEHOLD} api={catalog} />);
    await screen.findByText("No products yet.");

    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Oats" },
    });
    fireEvent.change(screen.getByLabelText("Minimum stock"), {
      target: { value: "1" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

    await waitFor(() => {
      expect(catalog.createProduct).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        name: "Oats",
        category_id: "cat-1",
        minimum_stock: 1,
      });
    });
  });

  it("calls only changed edit functions", async () => {
    const catalog = api();
    render(<ProductsScreen householdId={HOUSEHOLD} api={catalog} />);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Edit Milk" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Oat milk" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

    await waitFor(() => {
      expect(catalog.renameProduct).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        product_id: "prod-1",
        name: "Oat milk",
      });
    });
    expect(catalog.changeProductCategory).not.toHaveBeenCalled();
    expect(catalog.changeProductMinimumStock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit Milk" }));
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "cat-2" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

    await waitFor(() => {
      expect(catalog.changeProductCategory).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        product_id: "prod-1",
        category_id: "cat-2",
      });
    });
    expect(catalog.changeProductMinimumStock).not.toHaveBeenCalled();
    vi.mocked(catalog.changeProductCategory).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Edit Milk" }));
    fireEvent.change(screen.getByLabelText("Minimum stock"), {
      target: { value: "5" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

    await waitFor(() => {
      expect(catalog.changeProductMinimumStock).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        product_id: "prod-1",
        minimum_stock: 5,
      });
    });
    expect(catalog.changeProductCategory).not.toHaveBeenCalled();
  });

  it("does not archive until confirmation", async () => {
    const catalog = api();
    render(<ProductsScreen householdId={HOUSEHOLD} api={catalog} />);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Archive Milk" }));
    expect(catalog.archiveProduct).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Archive Milk?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(catalog.archiveProduct).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        product_id: "prod-1",
      });
    });
  });

  it("shows a mapped application error", async () => {
    const catalog = api({
      listActiveProducts: vi.fn().mockResolvedValue([]),
      createProduct: vi.fn().mockResolvedValue({ ok: false, code: "duplicate_name" }),
    });
    render(<ProductsScreen householdId={HOUSEHOLD} api={catalog} />);
    await screen.findByText("No products yet.");

    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Milk" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That name is already used.",
    );
  });

  it("disables create when there are no categories", async () => {
    const catalog = api({
      listActiveProducts: vi.fn().mockResolvedValue([]),
      listActiveCategories: vi.fn().mockResolvedValue([]),
    });
    render(<ProductsScreen householdId={HOUSEHOLD} api={catalog} />);
    await screen.findByText("Add a category first.");

    expect(screen.getByRole("button", { name: "Add product" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
