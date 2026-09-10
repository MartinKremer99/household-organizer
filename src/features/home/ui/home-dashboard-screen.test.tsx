/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HomeDashboardScreen,
  type HomeDashboardScreenApi,
} from "./home-dashboard-screen";

const HOUSEHOLD = "household-a";
const USER = "user-1";

const tomato = {
  id: "prod-1",
  household_id: HOUSEHOLD,
  name: "Tomato Sauce",
  category_id: "cat-1",
  minimum_stock: 4,
  barcode: null,
  is_active: true,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
};

const kitchen = {
  id: "loc-1",
  household_id: HOUSEHOLD,
  name: "Kitchen",
  is_active: true,
  sort_order: 0,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
};

const lowStock = {
  product_id: "prod-1",
  product_name: "Tomato Sauce",
  category_id: "cat-1",
  category_name: "Food",
  current_quantity: 1,
  minimum_stock: 4,
  suggested_quantity: 3,
};

const expiring = {
  lot_id: "lot-1",
  product_id: "prod-1",
  product_name: "Tomato Sauce",
  location_id: "loc-1",
  location_name: "Kitchen",
  quantity: 2,
  expiration_date: "2026-09-17",
};

const pendingProduct = {
  id: "shop-1",
  household_id: HOUSEHOLD,
  product_id: "prod-1",
  free_text: null,
  quantity: 5,
  status: "PENDING" as const,
  created_by: USER,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
  purchased_at: null,
  purchased_by: null,
};

function api(overrides: Partial<HomeDashboardScreenApi> = {}): HomeDashboardScreenApi {
  return {
    listLowStockInventory: vi.fn().mockResolvedValue([lowStock]),
    listExpiringInventory: vi.fn().mockResolvedValue([expiring]),
    listPendingShoppingItems: vi.fn().mockResolvedValue([pendingProduct]),
    listPurchasedStock: vi.fn().mockResolvedValue({
      ok: true,
      value: [{ product_id: "prod-1", quantity: 4 }],
    }),
    listActiveLocations: vi.fn().mockResolvedValue([kitchen]),
    listActiveProducts: vi.fn().mockResolvedValue([tomato]),
    addProductShoppingItem: vi.fn().mockResolvedValue({ ok: true, value: pendingProduct }),
    ...overrides,
  };
}

function emptyApi(): HomeDashboardScreenApi {
  return api({
    listLowStockInventory: vi.fn().mockResolvedValue([]),
    listExpiringInventory: vi.fn().mockResolvedValue([]),
    listPendingShoppingItems: vi.fn().mockResolvedValue([]),
    listPurchasedStock: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listActiveLocations: vi.fn().mockResolvedValue([]),
    listActiveProducts: vi.fn().mockResolvedValue([]),
  });
}

function renderScreen(dashboard: HomeDashboardScreenApi = api()) {
  return render(
    <HomeDashboardScreen
      householdId={HOUSEHOLD}
      userId={USER}
      today="2026-09-10"
      api={dashboard}
    />,
  );
}

async function card(title: string) {
  return within((await screen.findByRole("heading", { name: title })).closest("section")!);
}

afterEach(() => {
  cleanup();
});

describe("HomeDashboardScreen", () => {
  it("renders low stock count, suggested quantity, and product links", async () => {
    renderScreen();

    const low = await card("Low stock");
    expect(low.getByText("1 low-stock product")).toBeTruthy();
    expect(low.getByText("1 / min 4")).toBeTruthy();
    expect(low.getByRole("button", { name: "Add 3 Tomato Sauce to shopping" })).toBeTruthy();
    expect(low.getByRole("button", { name: "Add 3 Tomato Sauce to shopping" }).textContent).toBe(
      "Add 3 to shopping",
    );
    expect(low.getByRole("link", { name: "Tomato Sauce" }).getAttribute("href")).toBe(
      "/inventory/prod-1",
    );
    expect(low.getByRole("link", { name: "View inventory" }).getAttribute("href")).toBe(
      "/inventory",
    );
  });

  it("renders the low-stock empty state", async () => {
    renderScreen(
      api({
        listLowStockInventory: vi.fn().mockResolvedValue([]),
      }),
    );

    expect(await screen.findByText("No low-stock items.")).toBeTruthy();
  });

  it("does not show an add button when suggested quantity is 0", async () => {
    renderScreen(
      api({
        listLowStockInventory: vi.fn().mockResolvedValue([
          { ...lowStock, suggested_quantity: 0 },
        ]),
      }),
    );

    const low = await card("Low stock");
    expect(low.getByText("Tomato Sauce")).toBeTruthy();
    expect(low.queryByRole("button", { name: /to shopping/ })).toBeNull();
  });

  it("does not add to shopping on mount", async () => {
    const dashboard = api();
    renderScreen(dashboard);

    await screen.findByRole("button", { name: "Add 3 Tomato Sauce to shopping" });
    expect(dashboard.addProductShoppingItem).not.toHaveBeenCalled();
  });

  it("adds the application suggested quantity on click, not pending plus suggested", async () => {
    const dashboard = api();
    renderScreen(dashboard);

    fireEvent.click(
      await screen.findByRole("button", { name: "Add 3 Tomato Sauce to shopping" }),
    );

    await waitFor(() => {
      expect(dashboard.addProductShoppingItem).toHaveBeenCalledTimes(1);
    });
    expect(dashboard.addProductShoppingItem).toHaveBeenCalledWith({
      household_id: HOUSEHOLD,
      user_id: USER,
      product_id: "prod-1",
      quantity: 3,
    });
    expect(dashboard.addProductShoppingItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 8 }),
    );
  });

  it("refreshes low-stock and shopping after a successful add", async () => {
    const dashboard = api();
    renderScreen(dashboard);

    fireEvent.click(
      await screen.findByRole("button", { name: "Add 3 Tomato Sauce to shopping" }),
    );

    expect(await screen.findByText("Added to shopping.")).toBeTruthy();
    await waitFor(() => {
      expect(dashboard.listLowStockInventory).toHaveBeenCalledTimes(2);
      expect(dashboard.listPendingShoppingItems).toHaveBeenCalledTimes(2);
    });
    expect((await card("Low stock")).getByRole("link", { name: "Tomato Sauce" })).toBeTruthy();
  });

  it("keeps the product and allows retry after a persistence failure", async () => {
    const addProductShoppingItem = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "persistence_failure" })
      .mockResolvedValueOnce({ ok: true, value: pendingProduct });
    renderScreen(api({ addProductShoppingItem }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Add 3 Tomato Sauce to shopping" }),
    );

    expect(await screen.findByText("Could not update shopping. Try again.")).toBeTruthy();
    expect((await card("Low stock")).getByRole("link", { name: "Tomato Sauce" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add 3 Tomato Sauce to shopping" }));
    await waitFor(() => {
      expect(addProductShoppingItem).toHaveBeenCalledTimes(2);
    });
  });

  it("maps invalid quantity without showing codes", async () => {
    renderScreen(
      api({
        addProductShoppingItem: vi.fn().mockResolvedValue({
          ok: false,
          code: "invalid_quantity",
        }),
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Add 3 Tomato Sauce to shopping" }),
    );

    expect(await screen.findByText("Enter a whole number greater than 0.")).toBeTruthy();
    expect(screen.queryByText("invalid_quantity")).toBeNull();
  });

  it("maps invalid product without showing codes", async () => {
    renderScreen(
      api({
        addProductShoppingItem: vi.fn().mockResolvedValue({
          ok: false,
          code: "invalid_product",
        }),
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Add 3 Tomato Sauce to shopping" }),
    );

    expect(await screen.findByText("Could not update shopping. Try again.")).toBeTruthy();
    expect(screen.queryByText("invalid_product")).toBeNull();
  });

  it("renders expiring items and dates", async () => {
    renderScreen();

    const expiringCard = await card("Expiring soon");
    expect(expiringCard.getByText("1 lot expiring soon")).toBeTruthy();
    expect(expiringCard.getByText("2026-09-17")).toBeTruthy();
    expect(expiringCard.getByText("2")).toBeTruthy();
    expect(expiringCard.getByText("in 7 days")).toBeTruthy();
    expect(
      expiringCard.getByRole("link", { name: "Tomato Sauce · 2026-09-17" }).getAttribute("href"),
    ).toBe("/inventory/prod-1");
  });

  it("renders multiple expiring lots with a lot count", async () => {
    renderScreen(
      api({
        listExpiringInventory: vi.fn().mockResolvedValue([
          expiring,
          {
            ...expiring,
            lot_id: "lot-2",
            product_id: "prod-2",
            product_name: "Milk",
            quantity: 1,
            expiration_date: "2026-09-11",
          },
        ]),
      }),
    );

    const expiringCard = await card("Expiring soon");
    expect(expiringCard.getByText("2 lots expiring soon")).toBeTruthy();
    expect(
      expiringCard.getByRole("link", { name: "Tomato Sauce · 2026-09-17" }).getAttribute("href"),
    ).toBe("/inventory/prod-1");
    expect(expiringCard.getByRole("link", { name: "Milk · 2026-09-11" }).getAttribute("href")).toBe(
      "/inventory/prod-2",
    );
    expect(expiringCard.getByText("tomorrow")).toBeTruthy();
  });

  it("renders the expiring empty state", async () => {
    renderScreen(api({ listExpiringInventory: vi.fn().mockResolvedValue([]) }));
    expect(await screen.findByText("Nothing expiring soon.")).toBeTruthy();
    expect(screen.queryByText(/lots? expiring soon/)).toBeNull();
  });

  it("renders purchased stock and links to shopping", async () => {
    renderScreen();

    const purchased = await card("Purchased waiting to be stored");
    expect(purchased.getByText("1 waiting")).toBeTruthy();
    expect(purchased.getByText("4 remaining")).toBeTruthy();
    expect(purchased.getByRole("link", { name: "Tomato Sauce" }).getAttribute("href")).toBe(
      "/shopping",
    );
    expect(purchased.getByRole("link", { name: "View shopping" }).getAttribute("href")).toBe(
      "/shopping",
    );
  });

  it("renders the purchased empty state", async () => {
    renderScreen(
      api({
        listPurchasedStock: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      }),
    );
    expect(await screen.findByText("Nothing waiting to be stored.")).toBeTruthy();
  });

  it("renders shopping preview and links to shopping", async () => {
    renderScreen();

    const shopping = await card("Shopping overview");
    expect(shopping.getByText("1 to buy")).toBeTruthy();
    expect(shopping.getByText("5")).toBeTruthy();
    expect(shopping.getByRole("link", { name: "View shopping" }).getAttribute("href")).toBe(
      "/shopping",
    );
  });

  it("renders the shopping empty state", async () => {
    renderScreen(api({ listPendingShoppingItems: vi.fn().mockResolvedValue([]) }));
    expect(await screen.findByText("Nothing to buy.")).toBeTruthy();
  });

  it("renders location filter links without archived locations", async () => {
    renderScreen();

    const locations = await card("Quick locations");
    expect(locations.getByRole("link", { name: "Kitchen" })).toBeTruthy();
    expect(locations.getByRole("link", { name: "Kitchen" }).getAttribute("href")).toBe(
      "/inventory?location=loc-1",
    );
    expect(locations.queryByText("attic")).toBeNull();
  });

  it("renders useful empty states for a completely empty household", async () => {
    renderScreen(emptyApi());

    expect(await screen.findByText("No low-stock items.")).toBeTruthy();
    expect(screen.getByText("Nothing expiring soon.")).toBeTruthy();
    expect(screen.getByText("Nothing waiting to be stored.")).toBeTruthy();
    expect(screen.getByText("Nothing to buy.")).toBeTruthy();
    expect(screen.getByText("No locations yet.")).toBeTruthy();

    for (const title of [
      "Low stock",
      "Expiring soon",
      "Purchased waiting to be stored",
      "Shopping overview",
      "Quick locations",
    ]) {
      const body = await card(title);
      expect(body.getByRole("heading", { name: title }).nextElementSibling?.textContent).not.toMatch(
        /\d/,
      );
    }
  });

  it("shows section errors without raw codes", async () => {
    renderScreen(
      api({
        listLowStockInventory: vi.fn().mockRejectedValue(new Error("boom")),
        listPurchasedStock: vi.fn().mockResolvedValue({
          ok: false,
          code: "invalid_household",
        }),
      }),
    );

    expect(await screen.findByText("Could not load low stock.")).toBeTruthy();
    expect(screen.getByText("Could not load purchased stock.")).toBeTruthy();
    expect(screen.queryByText("invalid_household")).toBeNull();
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("links Add item to shopping", async () => {
    renderScreen(emptyApi());
    expect(await screen.findByRole("heading", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add item" }).getAttribute("href")).toBe("/shopping");
  });
});
