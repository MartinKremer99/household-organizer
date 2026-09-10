/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function api(overrides: Partial<InventoryOverviewScreenApi> = {}): InventoryOverviewScreenApi {
  return {
    listInventoryOverview: vi.fn().mockResolvedValue([milk, water]),
    listActiveCategories: vi.fn().mockResolvedValue([category]),
    listActiveLocations: vi.fn().mockResolvedValue([location]),
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
});
