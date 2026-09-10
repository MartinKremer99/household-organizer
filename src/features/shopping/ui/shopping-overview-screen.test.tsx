/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ShoppingOverviewScreen,
  type ShoppingOverviewScreenApi,
} from "./shopping-overview-screen";

const HOUSEHOLD = "household-a";
const USER = "user-1";

const tomato = {
  id: "prod-1",
  household_id: HOUSEHOLD,
  name: "Tomato Sauce",
  category_id: "cat-1",
  minimum_stock: 0,
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

const cellar = {
  id: "loc-2",
  household_id: HOUSEHOLD,
  name: "Cellar",
  is_active: true,
  sort_order: 1,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
};

const pendingTomato = {
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

const pendingCandles = {
  id: "shop-2",
  household_id: HOUSEHOLD,
  product_id: null,
  free_text: "Birthday candles",
  quantity: 1,
  status: "PENDING" as const,
  created_by: USER,
  created_at: "2026-09-09T10:01:00.000Z",
  updated_at: "2026-09-09T10:01:00.000Z",
  purchased_at: null,
  purchased_by: null,
};

const purchasedTomatoItem = {
  ...pendingTomato,
  status: "PURCHASED" as const,
  purchased_at: "2026-09-10T10:00:00.000Z",
  purchased_by: USER,
};

const purchasedCandles = {
  ...pendingCandles,
  status: "PURCHASED" as const,
  purchased_at: "2026-09-10T10:00:00.000Z",
  purchased_by: USER,
};

const okItem = { ok: true as const, value: pendingTomato };
const okPutAway = {
  ok: true as const,
  value: { operation_id: "op-1", remaining_quantity: 2, lots: [] },
};
const okConsume = { ok: true as const, value: { remaining_quantity: 2 } };

function api(overrides: Partial<ShoppingOverviewScreenApi> = {}): ShoppingOverviewScreenApi {
  return {
    listPendingShoppingItems: vi.fn().mockResolvedValue([pendingTomato, pendingCandles]),
    listPurchasedShoppingItems: vi.fn().mockResolvedValue([]),
    listPurchasedStock: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    addProductShoppingItem: vi.fn().mockResolvedValue(okItem),
    addFreeTextShoppingItem: vi.fn().mockResolvedValue(okItem),
    changeShoppingQuantity: vi.fn().mockResolvedValue(okItem),
    markShoppingItemPurchased: vi.fn().mockResolvedValue(okItem),
    putAwayPurchasedStock: vi.fn().mockResolvedValue(okPutAway),
    consumePurchasedStock: vi.fn().mockResolvedValue(okConsume),
    markFreeTextItemStored: vi.fn().mockResolvedValue(okItem),
    listActiveProducts: vi.fn().mockResolvedValue([tomato]),
    listActiveLocations: vi.fn().mockResolvedValue([kitchen, cellar]),
    ...overrides,
  };
}

function renderScreen(shopping: ShoppingOverviewScreenApi = api()) {
  return render(
    <ShoppingOverviewScreen householdId={HOUSEHOLD} userId={USER} api={shopping} />,
  );
}

async function openPurchasedTab() {
  fireEvent.click(await screen.findByRole("tab", { name: /Purchased/ }));
}

afterEach(() => {
  cleanup();
});

describe("ShoppingOverviewScreen", () => {
  it("renders pending product and free-text items with quantities", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Tomato Sauce" })).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Birthday candles" })).toBeTruthy();
    expect(screen.getByText("Note")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decrease Tomato Sauce quantity" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Increase Tomato Sauce quantity" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark Tomato Sauce purchased" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark Birthday candles purchased" })).toBeTruthy();
  });

  it("shows the empty to-buy copy after load", async () => {
    renderScreen(
      api({
        listPendingShoppingItems: vi.fn().mockResolvedValue([]),
      }),
    );

    expect(await screen.findByText("Nothing to buy.")).toBeTruthy();
  });

  it("adds a product shopping item and refreshes lists", async () => {
    const shopping = api();
    renderScreen(shopping);
    await screen.findByRole("heading", { name: "Tomato Sauce" });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const dialog = screen.getByRole("dialog", { name: "Add to shopping" });
    fireEvent.change(within(dialog).getByLabelText("Product"), {
      target: { value: "prod-1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Quantity"), {
      target: { value: "3" },
    });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Add" }).closest("form")!);

    await waitFor(() => {
      expect(shopping.addProductShoppingItem).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        user_id: USER,
        product_id: "prod-1",
        quantity: 3,
      });
    });
    await waitFor(() => {
      expect(shopping.listPendingShoppingItems).toHaveBeenCalledTimes(2);
      expect(shopping.listPurchasedShoppingItems).toHaveBeenCalledTimes(2);
      expect(shopping.listPurchasedStock).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole("dialog", { name: "Add to shopping" })).toBeNull();
  });

  it("adds a free-text shopping item", async () => {
    const shopping = api();
    renderScreen(shopping);
    await screen.findByRole("heading", { name: "Tomato Sauce" });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const dialog = screen.getByRole("dialog", { name: "Add to shopping" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Free text" }));
    fireEvent.change(within(dialog).getByLabelText("What do you need?"), {
      target: { value: "Paper plates" },
    });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Add" }).closest("form")!);

    await waitFor(() => {
      expect(shopping.addFreeTextShoppingItem).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        user_id: USER,
        free_text: "Paper plates",
        quantity: 1,
      });
    });
    expect(shopping.addProductShoppingItem).not.toHaveBeenCalled();
  });

  it("keeps the add form open and shows a mapped error on failure", async () => {
    const shopping = api({
      addProductShoppingItem: vi.fn().mockResolvedValue({
        ok: false,
        code: "invalid_product",
      }),
    });
    renderScreen(shopping);
    await screen.findByRole("heading", { name: "Tomato Sauce" });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const dialog = screen.getByRole("dialog", { name: "Add to shopping" });
    fireEvent.change(within(dialog).getByLabelText("Product"), {
      target: { value: "prod-1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Quantity"), {
      target: { value: "2" },
    });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Add" }).closest("form")!);

    expect(await screen.findByText("Could not update shopping. Try again.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Add to shopping" })).toBeTruthy();
    expect(within(dialog).getByLabelText("Quantity")).toHaveProperty("value", "2");
    expect(screen.queryByText("invalid_product")).toBeNull();
  });

  it("changes pending quantity and refreshes", async () => {
    const shopping = api();
    renderScreen(shopping);
    await screen.findByRole("heading", { name: "Tomato Sauce" });

    fireEvent.click(screen.getByRole("button", { name: "Increase Tomato Sauce quantity" }));

    await waitFor(() => {
      expect(shopping.changeShoppingQuantity).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        shopping_item_id: "shop-1",
        quantity: 6,
      });
    });
    await waitFor(() => {
      expect(shopping.listPendingShoppingItems).toHaveBeenCalledTimes(2);
    });
  });

  it("marks product and free-text items purchased and refreshes", async () => {
    const shopping = api();
    renderScreen(shopping);
    await screen.findByRole("heading", { name: "Tomato Sauce" });

    fireEvent.click(screen.getByRole("button", { name: "Mark Tomato Sauce purchased" }));
    await waitFor(() => {
      expect(shopping.markShoppingItemPurchased).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        user_id: USER,
        shopping_item_id: "shop-1",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark Birthday candles purchased" }));
    await waitFor(() => {
      expect(shopping.markShoppingItemPurchased).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        user_id: USER,
        shopping_item_id: "shop-2",
      });
    });
    await waitFor(() => {
      expect(shopping.listPendingShoppingItems).toHaveBeenCalledTimes(3);
      expect(shopping.listPurchasedShoppingItems).toHaveBeenCalledTimes(3);
      expect(shopping.listPurchasedStock).toHaveBeenCalledTimes(3);
    });
  });

  it("renders purchased stock and hides quantity controls", async () => {
    renderScreen(
      api({
        listPendingShoppingItems: vi.fn().mockResolvedValue([]),
        listPurchasedShoppingItems: vi.fn().mockResolvedValue([purchasedTomatoItem]),
        listPurchasedStock: vi.fn().mockResolvedValue({
          ok: true,
          value: [{ product_id: "prod-1", quantity: 4 }],
        }),
      }),
    );

    await openPurchasedTab();
    expect(await screen.findByRole("heading", { name: "Tomato Sauce" })).toBeTruthy();
    expect(screen.getByText("4 remaining")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Put away Tomato Sauce" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Consume Tomato Sauce" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decrease Tomato Sauce quantity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Increase Tomato Sauce quantity" })).toBeNull();
  });

  it("does not render purchased product shopping items as a second list", async () => {
    renderScreen(
      api({
        listPendingShoppingItems: vi.fn().mockResolvedValue([]),
        listPurchasedShoppingItems: vi.fn().mockResolvedValue([purchasedTomatoItem]),
        listPurchasedStock: vi.fn().mockResolvedValue({
          ok: true,
          value: [{ product_id: "prod-1", quantity: 4 }],
        }),
      }),
    );

    await openPurchasedTab();
    await screen.findByRole("heading", { name: "Tomato Sauce" });
    expect(screen.queryByRole("button", { name: "Mark Tomato Sauce stored" })).toBeNull();
    expect(screen.getAllByRole("heading", { name: "Tomato Sauce" })).toHaveLength(1);
  });

  it("puts away purchased stock with location, expiration, and partial quantity", async () => {
    const shopping = api({
      listPendingShoppingItems: vi.fn().mockResolvedValue([]),
      listPurchasedShoppingItems: vi.fn().mockResolvedValue([]),
      listPurchasedStock: vi.fn().mockResolvedValue({
        ok: true,
        value: [{ product_id: "prod-1", quantity: 4 }],
      }),
    });
    renderScreen(shopping);
    await openPurchasedTab();
    await screen.findByRole("heading", { name: "Tomato Sauce" });

    fireEvent.click(screen.getByRole("button", { name: "Put away Tomato Sauce" }));
    const dialog = screen.getByRole("dialog", { name: "Put away Tomato Sauce" });
    fireEvent.change(within(dialog).getByLabelText("Quantity"), {
      target: { value: "2" },
    });
    fireEvent.change(within(dialog).getByLabelText("Location"), {
      target: { value: "loc-2" },
    });
    fireEvent.change(within(dialog).getByLabelText("Expiration date"), {
      target: { value: "2027-01-10" },
    });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Put away" }).closest("form")!);

    await waitFor(() => {
      expect(shopping.putAwayPurchasedStock).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        user_id: USER,
        product_id: "prod-1",
        location_id: "loc-2",
        quantity: 2,
        expiration_date: "2027-01-10",
      });
    });
    await waitFor(() => {
      expect(shopping.listPurchasedStock).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole("dialog", { name: "Put away Tomato Sauce" })).toBeNull();
  });

  it("consumes purchased stock with a partial quantity", async () => {
    const shopping = api({
      listPendingShoppingItems: vi.fn().mockResolvedValue([]),
      listPurchasedShoppingItems: vi.fn().mockResolvedValue([]),
      listPurchasedStock: vi.fn().mockResolvedValue({
        ok: true,
        value: [{ product_id: "prod-1", quantity: 4 }],
      }),
    });
    renderScreen(shopping);
    await openPurchasedTab();
    await screen.findByRole("heading", { name: "Tomato Sauce" });

    fireEvent.click(screen.getByRole("button", { name: "Consume Tomato Sauce" }));
    const dialog = screen.getByRole("dialog", { name: "Consume Tomato Sauce" });
    fireEvent.change(within(dialog).getByLabelText("Quantity"), {
      target: { value: "1" },
    });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Consume" }).closest("form")!);

    await waitFor(() => {
      expect(shopping.consumePurchasedStock).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        product_id: "prod-1",
        quantity: 1,
      });
    });
    await waitFor(() => {
      expect(shopping.listPurchasedStock).toHaveBeenCalledTimes(2);
    });
  });

  it("stores purchased free-text items without put-away controls", async () => {
    const shopping = api({
      listPendingShoppingItems: vi.fn().mockResolvedValue([]),
      listPurchasedShoppingItems: vi.fn().mockResolvedValue([purchasedCandles]),
      listPurchasedStock: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });
    renderScreen(shopping);
    await openPurchasedTab();
    expect(await screen.findByRole("heading", { name: "Birthday candles" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark Birthday candles stored" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Put away Birthday candles" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Consume Birthday candles" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mark Birthday candles stored" }));
    await waitFor(() => {
      expect(shopping.markFreeTextItemStored).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        shopping_item_id: "shop-2",
      });
    });
    await waitFor(() => {
      expect(shopping.listPurchasedShoppingItems).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the empty purchased copy after load", async () => {
    renderScreen(
      api({
        listPendingShoppingItems: vi.fn().mockResolvedValue([]),
        listPurchasedShoppingItems: vi.fn().mockResolvedValue([]),
        listPurchasedStock: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      }),
    );

    await openPurchasedTab();
    expect(await screen.findByText("Nothing waiting to be stored.")).toBeTruthy();
  });
});
