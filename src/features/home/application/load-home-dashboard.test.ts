import { describe, expect, it, vi } from "vitest";
import {
  loadHomeDashboard,
  type HomeDashboardApi,
} from "./load-home-dashboard";

const HOUSEHOLD = "household-a";
const TODAY = "2026-09-10";

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
  created_by: "user-1",
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
  purchased_at: null,
  purchased_by: null,
};

const pendingNote = {
  ...pendingProduct,
  id: "shop-2",
  product_id: null,
  free_text: "Birthday candles",
  quantity: 1,
};

function api(overrides: Partial<HomeDashboardApi> = {}): HomeDashboardApi {
  return {
    listLowStockInventory: vi.fn().mockResolvedValue([lowStock]),
    listExpiringInventory: vi.fn().mockResolvedValue([expiring]),
    listPendingShoppingItems: vi.fn().mockResolvedValue([pendingProduct, pendingNote]),
    listPurchasedStock: vi.fn().mockResolvedValue({
      ok: true,
      value: [{ product_id: "prod-1", quantity: 4 }],
    }),
    listActiveLocations: vi.fn().mockResolvedValue([kitchen]),
    listActiveProducts: vi.fn().mockResolvedValue([tomato]),
    ...overrides,
  };
}

describe("loadHomeDashboard", () => {
  it("joins purchased and pending names and keeps free text", async () => {
    const data = await loadHomeDashboard(HOUSEHOLD, { api: api(), today: TODAY });

    expect(data.purchased).toEqual({
      ok: true,
      items: [{ product_id: "prod-1", product_name: "Tomato Sauce", quantity: 4 }],
    });
    expect(data.shopping).toEqual({
      ok: true,
      items: [
        { id: "shop-1", name: "Tomato Sauce", quantity: 5 },
        { id: "shop-2", name: "Birthday candles", quantity: 1 },
      ],
    });
  });

  it("fails only purchased when listPurchasedStock returns ok false", async () => {
    const data = await loadHomeDashboard(HOUSEHOLD, {
      today: TODAY,
      api: api({
        listPurchasedStock: vi.fn().mockResolvedValue({
          ok: false,
          code: "invalid_household",
        }),
      }),
    });

    expect(data.purchased).toEqual({ ok: false });
    expect(data.shopping.ok).toBe(true);
    expect(data.lowStock.ok).toBe(true);
  });

  it("fails only the rejected section", async () => {
    const data = await loadHomeDashboard(HOUSEHOLD, {
      today: TODAY,
      api: api({
        listLowStockInventory: vi.fn().mockRejectedValue(new Error("db")),
      }),
    });

    expect(data.lowStock).toEqual({ ok: false });
    expect(data.expiring.ok).toBe(true);
    expect(data.locations.ok).toBe(true);
  });

  it("keeps shopping and purchased when products reject", async () => {
    const data = await loadHomeDashboard(HOUSEHOLD, {
      today: TODAY,
      api: api({
        listActiveProducts: vi.fn().mockRejectedValue(new Error("db")),
      }),
    });

    expect(data.purchased).toEqual({
      ok: true,
      items: [
        { product_id: "prod-1", product_name: "Unavailable product", quantity: 4 },
      ],
    });
    expect(data.shopping).toEqual({
      ok: true,
      items: [
        { id: "shop-1", name: "Unavailable product", quantity: 5 },
        { id: "shop-2", name: "Birthday candles", quantity: 1 },
      ],
    });
  });

  it("asks for a 7-day expiration window", async () => {
    const dashboard = api();
    await loadHomeDashboard(HOUSEHOLD, { api: dashboard, today: TODAY });

    expect(dashboard.listExpiringInventory).toHaveBeenCalledWith(HOUSEHOLD, {
      today: TODAY,
      withinDays: 7,
    });
  });
});
