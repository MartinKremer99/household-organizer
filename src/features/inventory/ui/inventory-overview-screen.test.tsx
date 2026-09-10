/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryOverviewItem } from "@/features/inventory/application/read-inventory";
import {
  InventoryOverviewScreen,
  type InventoryOverviewScreenApi,
} from "./inventory-overview-screen";

const HOUSEHOLD = "household-a";

const milk: InventoryOverviewItem = {
  product_id: "prod-1",
  product_name: "Milk",
  category_id: "cat-1",
  category_name: "Food",
  minimum_stock: 4,
  total_quantity: 1,
  locations: [
    { location_id: "loc-1", location_name: "Kitchen", quantity: 1 },
  ],
};

const water: InventoryOverviewItem = {
  product_id: "prod-2",
  product_name: "Water",
  category_id: "cat-2",
  category_name: "Drinks",
  minimum_stock: 0,
  total_quantity: 0,
  locations: [],
};

const category = {
  id: "cat-1",
  household_id: HOUSEHOLD,
  name: "Food",
  is_active: true,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
};

const location = {
  id: "loc-1",
  household_id: HOUSEHOLD,
  name: "Kitchen",
  is_active: true,
  sort_order: 0,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
};

const oats = {
  id: "prod-oats",
  household_id: HOUSEHOLD,
  name: "Oats",
  category_id: "cat-1",
  minimum_stock: 0,
  barcode: null,
  is_active: true,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
};

function api(overrides: Partial<InventoryOverviewScreenApi> = {}): InventoryOverviewScreenApi {
  return {
    listInventoryOverview: vi.fn().mockResolvedValue([milk, water]),
    listActiveCategories: vi.fn().mockResolvedValue([category]),
    listActiveLocations: vi.fn().mockResolvedValue([location]),
    createProduct: vi.fn().mockResolvedValue({ ok: true, value: oats }),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("InventoryOverviewScreen", () => {
  it("renders name, category, totals, and location breakdown", async () => {
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={api()} />);

    expect(await screen.findByRole("heading", { name: "Milk" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Milk" }).textContent).toContain("Food");
    expect(screen.getByText("1 in stock")).toBeTruthy();
    expect(screen.getByText("Kitchen 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Milk" }).getAttribute("href")).toBe(
      "/inventory/prod-1",
    );
  });

  it("shows out of stock for a zero-quantity product", async () => {
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={api()} />);

    expect(await screen.findByRole("heading", { name: "Water" })).toBeTruthy();
    expect(screen.getByText("Out of stock")).toBeTruthy();
  });

  it("uses returned quantity and minimum stock for the low-stock label", async () => {
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={api()} />);

    expect(await screen.findByText("Low stock")).toBeTruthy();
    expect(screen.getByText("Min 4")).toBeTruthy();
    expect(screen.queryByText("Min 0")).toBeNull();
  });

  it("does not show low stock when minimum stock is zero", async () => {
    const inventory = api({
      listInventoryOverview: vi.fn().mockResolvedValue([water]),
    });
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={inventory} />);

    expect(await screen.findByRole("heading", { name: "Water" })).toBeTruthy();
    expect(screen.queryByText("Low stock")).toBeNull();
  });

  it("searches through listInventoryOverview", async () => {
    const inventory = api();
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={inventory} />);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.change(screen.getByLabelText("Search products"), {
      target: { value: "tom" },
    });

    await waitFor(() => {
      expect(inventory.listInventoryOverview).toHaveBeenCalledWith(HOUSEHOLD, {
        query: "tom",
      });
    });
    expect(inventory.listActiveCategories).toHaveBeenCalledTimes(1);
    expect(inventory.listActiveLocations).toHaveBeenCalledTimes(1);
  });

  it("passes only selected filter keys", async () => {
    const inventory = api();
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={inventory} />);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "cat-1" },
    });
    await waitFor(() => {
      expect(inventory.listInventoryOverview).toHaveBeenCalledWith(HOUSEHOLD, {
        category_id: "cat-1",
      });
    });

    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "loc-1" },
    });
    await waitFor(() => {
      expect(inventory.listInventoryOverview).toHaveBeenCalledWith(HOUSEHOLD, {
        category_id: "cat-1",
        location_id: "loc-1",
      });
    });

    fireEvent.change(screen.getByLabelText("Search products"), {
      target: { value: "mil" },
    });
    await waitFor(() => {
      expect(inventory.listInventoryOverview).toHaveBeenCalledWith(HOUSEHOLD, {
        query: "mil",
        category_id: "cat-1",
        location_id: "loc-1",
      });
    });
  });

  it("clears filters with a one-argument overview call", async () => {
    const inventory = api();
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={inventory} />);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.change(screen.getByLabelText("Search products"), {
      target: { value: "tom" },
    });
    await waitFor(() => {
      expect(inventory.listInventoryOverview).toHaveBeenCalledWith(HOUSEHOLD, {
        query: "tom",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => {
      const calls = vi.mocked(inventory.listInventoryOverview).mock.calls;
      expect(calls.at(-1)).toEqual([HOUSEHOLD]);
    });
  });

  it("shows the empty match copy when filters return nothing", async () => {
    const inventory = api({
      listInventoryOverview: vi
        .fn()
        .mockResolvedValueOnce([milk])
        .mockResolvedValueOnce([]),
    });
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={inventory} />);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.change(screen.getByLabelText("Search products"), {
      target: { value: "zzz" },
    });

    expect(await screen.findByText("No products match these filters.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add product" })).toBeNull();
  });

  it("seeds the location filter from initialLocationId", async () => {
    const inventory = api();
    render(
      <InventoryOverviewScreen
        householdId={HOUSEHOLD}
        initialLocationId="loc-1"
        api={inventory}
      />,
    );

    await waitFor(() => {
      expect(inventory.listInventoryOverview).toHaveBeenCalledWith(HOUSEHOLD, {
        location_id: "loc-1",
      });
    });
    expect(screen.getByLabelText("Location")).toHaveProperty("value", "loc-1");
  });

  it("shows the empty catalog copy when there are no products", async () => {
    const inventory = api({
      listInventoryOverview: vi.fn().mockResolvedValue([]),
    });
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={inventory} />);

    expect(await screen.findByText("No products yet.")).toBeTruthy();
  });

  it("opens the add product dialog from the empty catalog", async () => {
    const inventory = api({
      listInventoryOverview: vi.fn().mockResolvedValue([]),
    });
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={inventory} />);
    await screen.findByText("No products yet.");

    expect(screen.getAllByRole("button", { name: "Add product" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));

    expect(screen.getByRole("dialog", { name: "Add product" })).toBeTruthy();
  });

  it("opens the add product dialog from the header when products exist", async () => {
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={api()} />);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Add product" }));

    expect(screen.getByRole("dialog", { name: "Add product" })).toBeTruthy();
  });

  it("requires name and category and defaults minimum stock to zero", async () => {
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={api()} />);
    await screen.findByRole("heading", { name: "Milk" });
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Name")).toHaveProperty("required", true);
    expect(dialog.getByLabelText("Category")).toHaveProperty("required", true);
    expect(dialog.getByLabelText("Minimum stock")).toHaveProperty("value", "0");
    expect(dialog.getByRole("option", { name: "Food" })).toBeTruthy();
  });

  it("disables create and links to settings when there are no categories", async () => {
    const inventory = api({
      listActiveCategories: vi.fn().mockResolvedValue([]),
    });
    render(<InventoryOverviewScreen householdId={HOUSEHOLD} api={inventory} />);
    await screen.findByRole("heading", { name: "Milk" });

    expect(screen.getByRole("link", { name: /Settings.*Categories/ }).getAttribute("href")).toBe(
      "/settings/categories",
    );

    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(dialog.getByRole("link", { name: /Settings.*Categories/ }).getAttribute("href")).toBe(
      "/settings/categories",
    );
  });

  it("creates a product through createProduct and opens the new product", async () => {
    const onProductCreated = vi.fn();
    const inventory = api();
    render(
      <InventoryOverviewScreen
        householdId={HOUSEHOLD}
        onProductCreated={onProductCreated}
        api={inventory}
      />,
    );
    await screen.findByRole("heading", { name: "Milk" });
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));

    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Name"), { target: { value: "Oats" } });
    fireEvent.submit(dialog.getByRole("button", { name: "Save" }).closest("form")!);

    await waitFor(() => {
      expect(inventory.createProduct).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        name: "Oats",
        category_id: "cat-1",
        minimum_stock: 0,
      });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(inventory.listInventoryOverview).mock.calls.length).toBeGreaterThan(1);
    expect(onProductCreated).toHaveBeenCalledWith("prod-oats");
  });

  it("keeps the dialog open when createProduct fails", async () => {
    const onProductCreated = vi.fn();
    const inventory = api({
      createProduct: vi.fn().mockResolvedValue({ ok: false, code: "duplicate_name" }),
    });
    render(
      <InventoryOverviewScreen
        householdId={HOUSEHOLD}
        onProductCreated={onProductCreated}
        api={inventory}
      />,
    );
    await screen.findByRole("heading", { name: "Milk" });
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));

    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Name"), { target: { value: "Milk" } });
    fireEvent.submit(dialog.getByRole("button", { name: "Save" }).closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toBe("That name is already used.");
    expect(screen.getByRole("dialog", { name: "Add product" })).toBeTruthy();
    expect(onProductCreated).not.toHaveBeenCalled();
  });
});
