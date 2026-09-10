import { expect, test } from "@playwright/test";
import { expectHome, openUserContext, signInAndCreateHousehold } from "../helpers/auth-ui";
import { seedCatalog } from "../helpers/catalog-ui";
import { countPendingOperations } from "../helpers/dexie";
import {
  addStock,
  createProductFromInventory,
  moveStock,
  removeStock,
} from "../helpers/inventory-ui";
import { startRequestLog } from "../helpers/network";
import { skipIfNoLocalSupabase } from "../helpers/require-local";
import {
  addProductToShopping,
  markPurchased,
  openShopping,
} from "../helpers/shopping-ui";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test.fixme(
  "offline inventory and shopping stay in Dexie and do not auto-sync — production never writes a Dexie household row after create",
  async ({ browser }) => {
  const { context, page } = await openUserContext(browser);
  const log = startRequestLog(page);

  try {
    await signInAndCreateHousehold(page, "off-a");
    await seedCatalog(page);
    await createProductFromInventory(page, "Oats");
    await addStock(page, { quantity: 4, location: "Kitchen" });
    await openShopping(page);
    await page.getByRole("link", { name: "Inventory" }).click();
    await page.getByRole("link", { name: "Oats", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Oats" })).toBeVisible();

    const beforeInventory = await countPendingOperations(page);
    log.clear();
    await context.setOffline(true);
    await expect(page.getByText("Offline", { exact: true })).toBeVisible();

    await addStock(page, { quantity: 1, location: "Kitchen" });
    await expect(page.getByText("Total: 5")).toBeVisible();
    await moveStock(page, { quantity: 2, source: "Kitchen", destination: "Cellar" });
    await expect(page.getByText("Cellar: 2")).toBeVisible();
    await removeStock(page, { quantity: 1, location: "Kitchen" });
    await expect(page.getByText("Total: 4")).toBeVisible();
    expect(await countPendingOperations(page)).toBeGreaterThan(beforeInventory);
    expect(log.supabaseHits()).toEqual([]);

    await context.setOffline(false);
    await expect(page.getByText("Back online", { exact: true })).toBeVisible();
    expect(log.rpcHits("apply_inventory_command")).toEqual([]);

    await openShopping(page);
    const beforeShopping = await countPendingOperations(page);
    log.clear();
    await context.setOffline(true);
    await expect(page.getByText("Offline", { exact: true })).toBeVisible();
    await addProductToShopping(page, "Oats", 1);
    await markPurchased(page, "Oats");
    await expect(page.getByRole("tab", { name: /Purchased \(1\)/ })).toBeVisible();
    expect(await countPendingOperations(page)).toBeGreaterThan(beforeShopping);
    expect(log.supabaseHits()).toEqual([]);

    await context.setOffline(false);
    await expect(page.getByText("Back online", { exact: true })).toBeVisible();
    expect(log.rpcHits("apply_inventory_command")).toEqual([]);

    await page.getByRole("link", { name: "Home" }).click();
    await expectHome(page);
    await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
    expect(log.rpcHits("apply_inventory_command")).toEqual([]);
  } finally {
    await context.close();
  }
});
