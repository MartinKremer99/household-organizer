import { describe, expect, it, vi } from "vitest";
import type { ExpiringInventoryItem, LowStockInventoryItem } from "@/features/inventory/application/read-inventory";
import { DEFAULT_NOTIFICATION_STATE } from "./notification-store";
import {
  evaluateHouseholdNotifications,
  type EvaluateNotificationsApi,
} from "./evaluate-notifications";

const HOUSEHOLD = "household-a";
const TODAY = "2026-09-10";

const lowMilk: LowStockInventoryItem = {
  product_id: "prod-milk",
  product_name: "Milk",
  category_id: "cat-1",
  category_name: "Food",
  current_quantity: 1,
  minimum_stock: 4,
  suggested_quantity: 3,
};

const expYogurt: ExpiringInventoryItem = {
  lot_id: "lot-1",
  product_id: "prod-yogurt",
  product_name: "Yogurt",
  location_id: "loc-1",
  location_name: "Kitchen",
  quantity: 2,
  expiration_date: "2026-09-13",
};

function memoryStore(initial = DEFAULT_NOTIFICATION_STATE) {
  let state = { ...initial, seen: [...initial.seen] };
  return {
    load: vi.fn(() => ({ ...state, seen: [...state.seen] })),
    save: vi.fn((_householdId: string, next: typeof state) => {
      state = { ...next, seen: [...next.seen] };
    }),
  };
}

function api(overrides: Partial<EvaluateNotificationsApi> = {}): EvaluateNotificationsApi {
  return {
    listLowStockInventory: vi.fn().mockResolvedValue([]),
    listExpiringInventory: vi.fn().mockResolvedValue([]),
    store: memoryStore(),
    browser: {
      permission: () => "granted",
      requestPermission: vi.fn(),
      show: vi.fn(),
    },
    ...overrides,
  };
}

describe("evaluateHouseholdNotifications", () => {
  it("is a no-op without grant or when toggles are off", async () => {
    const denied = api({
      browser: {
        permission: () => "denied",
        requestPermission: vi.fn(),
        show: vi.fn(),
      },
      store: memoryStore({ lowStock: true, expiration: true, seen: [] }),
    });
    await evaluateHouseholdNotifications(HOUSEHOLD, { api: denied, today: TODAY });
    expect(denied.listLowStockInventory).not.toHaveBeenCalled();
    expect(denied.browser.show).not.toHaveBeenCalled();
    expect(denied.browser.requestPermission).not.toHaveBeenCalled();

    const off = api({
      store: memoryStore({ lowStock: false, expiration: false, seen: [] }),
    });
    await evaluateHouseholdNotifications(HOUSEHOLD, { api: off, today: TODAY });
    expect(off.listLowStockInventory).not.toHaveBeenCalled();
    expect(off.listExpiringInventory).not.toHaveBeenCalled();
    expect(off.browser.show).not.toHaveBeenCalled();
  });

  it("notifies low stock from listLowStockInventory with name, quantity, and minimum", async () => {
    const client = api({
      listLowStockInventory: vi.fn().mockResolvedValue([lowMilk]),
      store: memoryStore({ lowStock: true, expiration: false, seen: [] }),
    });

    await evaluateHouseholdNotifications(HOUSEHOLD, { api: client, today: TODAY });

    expect(client.listLowStockInventory).toHaveBeenCalledWith(HOUSEHOLD);
    expect(client.listExpiringInventory).not.toHaveBeenCalled();
    expect(client.browser.show).toHaveBeenCalledWith({
      title: "Low stock",
      body: "Milk: 1 in stock (min 4, buy 3)",
      tag: "low:prod-milk:1:4",
      url: "/inventory/prod-milk",
    });
  });

  it("does not notify the same low-stock condition twice", async () => {
    const store = memoryStore({ lowStock: true, expiration: false, seen: [] });
    const show = vi.fn();
    const client = api({
      listLowStockInventory: vi.fn().mockResolvedValue([lowMilk]),
      store,
      browser: { permission: () => "granted", requestPermission: vi.fn(), show },
    });

    await evaluateHouseholdNotifications(HOUSEHOLD, { api: client, today: TODAY });
    await evaluateHouseholdNotifications(HOUSEHOLD, { api: client, today: TODAY });

    expect(show).toHaveBeenCalledTimes(1);
  });

  it("notifies again when quantity or minimum changes", async () => {
    const store = memoryStore({ lowStock: true, expiration: false, seen: [] });
    const show = vi.fn();
    const listLowStockInventory = vi
      .fn()
      .mockResolvedValueOnce([lowMilk])
      .mockResolvedValueOnce([{ ...lowMilk, current_quantity: 0, suggested_quantity: 4 }]);
    const client = api({
      listLowStockInventory,
      store,
      browser: { permission: () => "granted", requestPermission: vi.fn(), show },
    });

    await evaluateHouseholdNotifications(HOUSEHOLD, { api: client, today: TODAY });
    await evaluateHouseholdNotifications(HOUSEHOLD, { api: client, today: TODAY });

    expect(show).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenLastCalledWith(
      expect.objectContaining({ tag: "low:prod-milk:0:4" }),
    );
  });

  it("notifies expiring lots from listExpiringInventory using the 7-day window", async () => {
    const listExpiringInventory = vi.fn().mockResolvedValue([expYogurt]);
    const client = api({
      listExpiringInventory,
      store: memoryStore({ lowStock: false, expiration: true, seen: [] }),
    });

    await evaluateHouseholdNotifications(HOUSEHOLD, { api: client, today: TODAY });

    expect(listExpiringInventory).toHaveBeenCalledWith(HOUSEHOLD, {
      today: TODAY,
      withinDays: 7,
    });
    expect(client.listLowStockInventory).not.toHaveBeenCalled();
    expect(client.browser.show).toHaveBeenCalledWith({
      title: "Expiring soon",
      body: "Yogurt: 2 on 2026-09-13",
      tag: "exp:prod-yogurt:lot-1:2026-09-13:2",
      url: "/inventory/prod-yogurt",
    });
  });

  it("does not notify the same expiration condition twice", async () => {
    const store = memoryStore({ lowStock: false, expiration: true, seen: [] });
    const show = vi.fn();
    const client = api({
      listExpiringInventory: vi.fn().mockResolvedValue([expYogurt]),
      store,
      browser: { permission: () => "granted", requestPermission: vi.fn(), show },
    });

    await evaluateHouseholdNotifications(HOUSEHOLD, { api: client, today: TODAY });
    await evaluateHouseholdNotifications(HOUSEHOLD, { api: client, today: TODAY });

    expect(show).toHaveBeenCalledTimes(1);
  });

  it("notifies again when expiration quantity or date changes", async () => {
    const store = memoryStore({ lowStock: false, expiration: true, seen: [] });
    const show = vi.fn();
    const listExpiringInventory = vi
      .fn()
      .mockResolvedValueOnce([expYogurt])
      .mockResolvedValueOnce([{ ...expYogurt, quantity: 1 }]);
    const client = api({
      listExpiringInventory,
      store,
      browser: { permission: () => "granted", requestPermission: vi.fn(), show },
    });

    await evaluateHouseholdNotifications(HOUSEHOLD, { api: client, today: TODAY });
    await evaluateHouseholdNotifications(HOUSEHOLD, { api: client, today: TODAY });

    expect(show).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenLastCalledWith(
      expect.objectContaining({ tag: "exp:prod-yogurt:lot-1:2026-09-13:1" }),
    );
  });
});
