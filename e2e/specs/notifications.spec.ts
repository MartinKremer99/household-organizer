import { expect, test } from "@playwright/test";
import { openUserContext, signInAndCreateHousehold } from "../helpers/auth-ui";
import { seedCatalog } from "../helpers/catalog-ui";
import { localIsoDate } from "../helpers/dates";
import { addStock, createProductFromInventory } from "../helpers/inventory-ui";
import {
  expectStubbedNotification,
  stubPageNotifications,
} from "../helpers/notifications";
import { skipIfNoLocalSupabase } from "../helpers/require-local";
import {
  enableBrowserNotifications,
  expectNotificationsCard,
  openSettings,
  setNotificationPreference,
} from "../helpers/settings-ui";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test("Settings shows notification controls and Enable requests permission", async ({
  browser,
}) => {
  const { context, page } = await openUserContext(browser);
  await stubPageNotifications(context, { permission: "default" });

  try {
    await signInAndCreateHousehold(page, "note-a");
    await openSettings(page);
    await expectNotificationsCard(page);
    await expect(page.getByText("Browser notifications: Not permitted")).toBeVisible();
    await expect(page.getByRole("button", { name: "Low stock" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Expiration" })).toBeDisabled();

    await enableBrowserNotifications(page);
    await expect(page.getByText("Browser notifications: Allowed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Low stock" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Expiration" })).toBeEnabled();
  } finally {
    await context.close();
  }
});

test("enabling preferences notifies known low-stock and expiring items", async ({
  browser,
}) => {
  const { context, page } = await openUserContext(browser, {
    permissions: ["notifications"],
  });
  await stubPageNotifications(context);
  const soon = localIsoDate(3);

  try {
    await signInAndCreateHousehold(page, "note-b");
    await seedCatalog(page);
    await createProductFromInventory(page, "Milk", { minimumStock: 4 });
    await createProductFromInventory(page, "Yogurt");
    await addStock(page, { quantity: 1, location: "Kitchen", expiration: soon });

    await openSettings(page);
    await expectNotificationsCard(page);
    await expect(page.getByText("Browser notifications: Allowed")).toBeVisible();

    await setNotificationPreference(page, "Low stock", true);
    await expectStubbedNotification(page, {
      title: "Low stock",
      body: "Milk: 0 in stock (min 4, buy 4)",
    });

    await setNotificationPreference(page, "Expiration", true);
    await expectStubbedNotification(page, {
      title: "Expiring soon",
      body: `Yogurt: 1 on ${soon}`,
    });
  } finally {
    await context.close();
  }
});
