import {
  listExpiringInventory,
  listLowStockInventory,
  type ExpiringInventoryItem,
  type LowStockInventoryItem,
} from "@/features/inventory/application/read-inventory";
import { todayIsoDate } from "@/lib/domain/inventory/lots";
import {
  createBrowserNotifications,
  type BrowserNotifications,
} from "./browser-notifications";
import {
  createNotificationStore,
  type NotificationState,
  type NotificationStore,
} from "./notification-store";

export type EvaluateNotificationsApi = {
  listLowStockInventory: typeof listLowStockInventory;
  listExpiringInventory: typeof listExpiringInventory;
  store: NotificationStore;
  browser: BrowserNotifications;
};

const defaults: EvaluateNotificationsApi = {
  listLowStockInventory,
  listExpiringInventory,
  store: createNotificationStore(),
  browser: createBrowserNotifications(),
};

function lowStockKey(item: LowStockInventoryItem): string {
  return `low:${item.product_id}:${item.current_quantity}:${item.minimum_stock}`;
}

function expirationKey(item: ExpiringInventoryItem): string {
  return `exp:${item.product_id}:${item.lot_id}:${item.expiration_date}:${item.quantity}`;
}

function lowStockBody(item: LowStockInventoryItem): string {
  if (item.suggested_quantity > 0) {
    return `${item.product_name}: ${item.current_quantity} in stock (min ${item.minimum_stock}, buy ${item.suggested_quantity})`;
  }
  return `${item.product_name}: ${item.current_quantity} in stock (min ${item.minimum_stock})`;
}

export async function evaluateHouseholdNotifications(
  householdId: string,
  options?: { api?: Partial<EvaluateNotificationsApi>; today?: string },
): Promise<void> {
  const api = { ...defaults, ...options?.api };
  if (api.browser.permission() !== "granted") {
    return;
  }

  const prefs = api.store.load(householdId);
  if (!prefs.lowStock && !prefs.expiration) {
    return;
  }

  const today = options?.today ?? todayIsoDate();
  const seen = new Set(prefs.seen);
  const currentKeys: string[] = [];

  if (prefs.lowStock) {
    const items = await api.listLowStockInventory(householdId);
    for (const item of items) {
      const key = lowStockKey(item);
      currentKeys.push(key);
      if (seen.has(key)) {
        continue;
      }
      api.browser.show({
        title: "Low stock",
        body: lowStockBody(item),
        tag: key,
        url: `/inventory/${item.product_id}`,
      });
    }
  }

  if (prefs.expiration) {
    const items = await api.listExpiringInventory(householdId, {
      today,
      withinDays: 7,
    });
    for (const item of items) {
      const key = expirationKey(item);
      currentKeys.push(key);
      if (seen.has(key)) {
        continue;
      }
      api.browser.show({
        title: "Expiring soon",
        body: `${item.product_name}: ${item.quantity} on ${item.expiration_date}`,
        tag: key,
        url: `/inventory/${item.product_id}`,
      });
    }
  }

  const next: NotificationState = {
    lowStock: prefs.lowStock,
    expiration: prefs.expiration,
    seen: currentKeys,
  };
  api.store.save(householdId, next);
}
