/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductInventory } from "@/features/inventory/application/read-inventory";
import {
  InventoryProductScreen,
  type InventoryProductScreenApi,
} from "./inventory-product-screen";

const HOUSEHOLD = "household-a";
const USER = "user-1";

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

const milk: ProductInventory = {
  product_id: "prod-1",
  product_name: "Milk",
  category_id: "cat-1",
  category_name: "Food",
  minimum_stock: 4,
  total_quantity: 5,
  locations: [
    { location_id: "loc-1", location_name: "Kitchen", quantity: 3 },
    { location_id: "loc-2", location_name: "Cellar", quantity: 2 },
  ],
  lots: [
    {
      lot_id: "lot-dated",
      location_id: "loc-1",
      location_name: "Kitchen",
      quantity: 2,
      expiration_date: "2026-09-12",
      expired: false,
    },
    {
      lot_id: "lot-expired",
      location_id: "loc-1",
      location_name: "Kitchen",
      quantity: 1,
      expiration_date: "2020-01-01",
      expired: true,
    },
    {
      lot_id: "lot-undated",
      location_id: "loc-2",
      location_name: "Cellar",
      quantity: 2,
      expiration_date: null,
      expired: false,
    },
  ],
};

const success = { ok: true as const, value: { operation_id: "op-1", lots: [] } };

function api(overrides: Partial<InventoryProductScreenApi> = {}): InventoryProductScreenApi {
  return {
    getProductInventory: vi.fn().mockResolvedValue({ ok: true, value: milk }),
    listActiveLocations: vi.fn().mockResolvedValue([kitchen, cellar]),
    addInventory: vi.fn().mockResolvedValue(success),
    removeInventory: vi.fn().mockResolvedValue(success),
    moveInventory: vi.fn().mockResolvedValue(success),
    ...overrides,
  };
}

function renderScreen(inventory: InventoryProductScreenApi = api()) {
  return render(
    <InventoryProductScreen
      householdId={HOUSEHOLD}
      userId={USER}
      productId="prod-1"
      today="2026-09-10"
      api={inventory}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("InventoryProductScreen", () => {
  it("renders product information and location quantities", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Milk" })).toBeTruthy();
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("5 in stock")).toBeTruthy();
    expect(screen.getByText("Min 4")).toBeTruthy();
    expect(screen.getByText("Kitchen 3")).toBeTruthy();
    expect(screen.getByText("Cellar 2")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to inventory" }).getAttribute("href")).toBe(
      "/inventory",
    );
  });

  it("renders dated, undated, and expired lots", async () => {
    const inventory = api();
    renderScreen(inventory);

    expect(await screen.findByText("2026-09-12")).toBeTruthy();
    expect(screen.getByText("in 2 days")).toBeTruthy();
    expect(screen.getByText("No expiration")).toBeTruthy();
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("2020-01-01")).toBeTruthy();
    expect(screen.getByText("2 at Kitchen")).toBeTruthy();
    expect(screen.getByText("2 at Cellar")).toBeTruthy();
    expect(inventory.getProductInventory).toHaveBeenCalledWith(HOUSEHOLD, "prod-1", {
      today: "2026-09-10",
    });
  });

  it("shows a not-found message without the raw error code", async () => {
    render(
      <InventoryProductScreen
        householdId={HOUSEHOLD}
        userId={USER}
        productId="missing"
        api={api({
          getProductInventory: vi.fn().mockResolvedValue({
            ok: false,
            code: "not_found",
          }),
        })}
      />,
    );

    expect(
      await screen.findByText("This product is not in your inventory."),
    ).toBeTruthy();
    expect(screen.queryByText("not_found")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Milk" })).toBeNull();
  });

  it("shows no lots on hand for an empty lot list", async () => {
    renderScreen(
      api({
        getProductInventory: vi.fn().mockResolvedValue({
          ok: true,
          value: { ...milk, total_quantity: 0, locations: [], lots: [] },
        }),
      }),
    );

    expect(await screen.findByText("Out of stock")).toBeTruthy();
    expect(screen.getByText("No lots on hand.")).toBeTruthy();
  });

  it("does not add stock when quantity is empty", async () => {
    const inventory = api();
    renderScreen(inventory);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Add stock" }));
    const addDialog = screen.getByRole("dialog", { name: "Add stock" });
    fireEvent.submit(within(addDialog).getByRole("button", { name: "Add stock" }).closest("form")!);

    expect(inventory.addInventory).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a whole number greater than 0.")).toBeTruthy();
  });

  it("adds stock and refreshes the product", async () => {
    const inventory = api();
    renderScreen(inventory);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Add stock" }));
    const addDialog = screen.getByRole("dialog", { name: "Add stock" });
    fireEvent.change(within(addDialog).getByLabelText("Quantity"), {
      target: { value: "2" },
    });
    fireEvent.change(within(addDialog).getByLabelText("Expiration date"), {
      target: { value: "2027-01-10" },
    });
    fireEvent.submit(within(addDialog).getByRole("button", { name: "Add stock" }).closest("form")!);

    await waitFor(() => {
      expect(inventory.addInventory).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        user_id: USER,
        product_id: "prod-1",
        location_id: "loc-1",
        quantity: 2,
        expiration_date: "2027-01-10",
      });
    });
    await waitFor(() => {
      expect(inventory.getProductInventory).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole("dialog", { name: "Add stock" })).toBeNull();
  });

  it("omits expiration_date when Add stock expiration is empty", async () => {
    const inventory = api();
    renderScreen(inventory);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Add stock" }));
    const addDialog = screen.getByRole("dialog", { name: "Add stock" });
    fireEvent.change(within(addDialog).getByLabelText("Quantity"), {
      target: { value: "2" },
    });
    fireEvent.submit(within(addDialog).getByRole("button", { name: "Add stock" }).closest("form")!);

    await waitFor(() => {
      expect(inventory.addInventory).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        user_id: USER,
        product_id: "prod-1",
        location_id: "loc-1",
        quantity: 2,
      });
    });
    expect(inventory.addInventory).not.toHaveBeenCalledWith(
      expect.objectContaining({ expiration_date: expect.anything() }),
    );
  });

  it("keeps the add form open and shows a mapped error on failure", async () => {
    const inventory = api({
      addInventory: vi.fn().mockResolvedValue({ ok: false, code: "invalid_location" }),
    });
    renderScreen(inventory);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Add stock" }));
    const addDialog = screen.getByRole("dialog", { name: "Add stock" });
    fireEvent.change(within(addDialog).getByLabelText("Quantity"), {
      target: { value: "2" },
    });
    fireEvent.submit(within(addDialog).getByRole("button", { name: "Add stock" }).closest("form")!);

    expect(await screen.findByText("Could not update inventory. Try again.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Add stock" })).toBeTruthy();
    expect(screen.getByLabelText("Quantity")).toHaveProperty("value", "2");
    expect(screen.queryByText("invalid_location")).toBeNull();
  });

  it("renders removable lots and omits inventory_lot_id for FEFO remove", async () => {
    const inventory = api();
    renderScreen(inventory);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const removeDialog = screen.getByRole("dialog", { name: "Remove" });
    expect(
      within(removeDialog).getByRole("option", { name: "Kitchen · 2 · 2026-09-12" }),
    ).toBeTruthy();
    expect(
      within(removeDialog).getByRole("option", { name: "Kitchen · 1 · 2020-01-01" }),
    ).toBeTruthy();
    expect(within(removeDialog).queryByRole("option", { name: /Cellar ·/ })).toBeNull();

    fireEvent.change(within(removeDialog).getByLabelText("Quantity"), {
      target: { value: "1" },
    });
    fireEvent.submit(within(removeDialog).getByRole("button", { name: "Remove" }).closest("form")!);

    await waitFor(() => {
      expect(inventory.removeInventory).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        user_id: USER,
        product_id: "prod-1",
        location_id: "loc-1",
        quantity: 1,
      });
    });
    expect(inventory.removeInventory).toHaveBeenCalledWith(
      expect.not.objectContaining({ inventory_lot_id: expect.anything() }),
    );
  });

  it("passes a selected lot on remove and maps insufficient stock", async () => {
    const inventory = api({
      removeInventory: vi.fn().mockResolvedValue({
        ok: false,
        code: "insufficient_stock",
      }),
    });
    renderScreen(inventory);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const removeDialog = screen.getByRole("dialog", { name: "Remove" });
    fireEvent.change(within(removeDialog).getByLabelText("Quantity"), {
      target: { value: "3" },
    });
    fireEvent.change(within(removeDialog).getByLabelText("Lot"), {
      target: { value: "lot-dated" },
    });
    fireEvent.submit(within(removeDialog).getByRole("button", { name: "Remove" }).closest("form")!);

    await waitFor(() => {
      expect(inventory.removeInventory).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        user_id: USER,
        product_id: "prod-1",
        location_id: "loc-1",
        quantity: 3,
        inventory_lot_id: "lot-dated",
      });
    });
    expect(await screen.findByText("Not enough stock at that location.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Remove" })).toBeTruthy();
    expect(screen.queryByText("insufficient_stock")).toBeNull();
  });

  it("does not move when source and destination are the same", async () => {
    const inventory = api();
    renderScreen(inventory);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    const moveDialog = screen.getByRole("dialog", { name: "Move" });
    fireEvent.change(within(moveDialog).getByLabelText("Quantity"), {
      target: { value: "1" },
    });
    fireEvent.change(within(moveDialog).getByLabelText("Destination"), {
      target: { value: "loc-1" },
    });

    expect(within(moveDialog).getByRole("button", { name: "Move" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(within(moveDialog).getByText("Choose two different locations.")).toBeTruthy();
    fireEvent.submit(within(moveDialog).getByRole("button", { name: "Move" }).closest("form")!);
    expect(inventory.moveInventory).not.toHaveBeenCalled();
  });

  it("moves stock and refreshes the product", async () => {
    const inventory = api();
    renderScreen(inventory);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    const moveDialog = screen.getByRole("dialog", { name: "Move" });
    fireEvent.change(within(moveDialog).getByLabelText("Quantity"), {
      target: { value: "2" },
    });
    fireEvent.submit(within(moveDialog).getByRole("button", { name: "Move" }).closest("form")!);

    await waitFor(() => {
      expect(inventory.moveInventory).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        user_id: USER,
        product_id: "prod-1",
        source_location_id: "loc-1",
        destination_location_id: "loc-2",
        quantity: 2,
      });
    });
    await waitFor(() => {
      expect(inventory.getProductInventory).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole("dialog", { name: "Move" })).toBeNull();
  });

  it("maps an invalid move from the application layer", async () => {
    const inventory = api({
      moveInventory: vi.fn().mockResolvedValue({ ok: false, code: "invalid_move" }),
    });
    renderScreen(inventory);
    await screen.findByRole("heading", { name: "Milk" });

    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    const moveDialog = screen.getByRole("dialog", { name: "Move" });
    fireEvent.change(within(moveDialog).getByLabelText("Quantity"), {
      target: { value: "1" },
    });
    fireEvent.submit(within(moveDialog).getByRole("button", { name: "Move" }).closest("form")!);

    expect(await screen.findByText("Choose two different locations.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Move" })).toBeTruthy();
    expect(screen.queryByText("invalid_move")).toBeNull();
  });
});
