import { expect, test } from "@playwright/test";
import {
  expectHome,
  openUserContext,
  signInAndCreateHousehold,
  signInAndJoinHousehold,
} from "../helpers/auth-ui";
import { addNamedCategory, seedCatalog } from "../helpers/catalog-ui";
import {
  addStock,
  createProductFromInventory,
  moveStock,
  removeStock,
} from "../helpers/inventory-ui";
import { skipIfNoLocalSupabase } from "../helpers/require-local";
import {
  addProductToShopping,
  markPurchased,
  openPurchasedTab,
  openShopping,
  putAwayProduct,
} from "../helpers/shopping-ui";
import { expectSynced } from "../helpers/sync-ui";
import { listInventoryLots } from "../helpers/users";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test("B Inventory UI shows A's quantity after A syncs", async ({ browser }) => {
  const a = await openUserContext(browser);
  const b = await openUserContext(browser);

  try {
    const created = await signInAndCreateHousehold(a.page, "gap-a");
    await seedCatalog(a.page);
    await createProductFromInventory(a.page, "Shared oats");
    await addStock(a.page, { quantity: 4, location: "Kitchen" });
    await a.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(a.page);

    await signInAndJoinHousehold(b.page, "gap-b", created.joinCode);
    await expectHome(b.page);
    await b.page.getByRole("link", { name: "Inventory" }).click();
    await expect(b.page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(b.page.getByRole("link", { name: "Shared oats" })).toBeVisible();
    await expect(b.page.getByText("4 in stock")).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("Add stock persists after UI household create", async ({ browser }) => {
  const { context, page } = await openUserContext(browser);

  try {
    await signInAndCreateHousehold(page, "gap-dexie");
    await seedCatalog(page);
    await createProductFromInventory(page, "Blocked oats");
    await addStock(page, { quantity: 2, location: "Kitchen" });
    await expect(page.getByText("Total: 2")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("Sync now uploads UI-created stock", async ({ browser }) => {
  const { context, page } = await openUserContext(browser);

  try {
    const created = await signInAndCreateHousehold(page, "gap-sync");
    await seedCatalog(page);
    await createProductFromInventory(page, "Uploaded oats");
    await addStock(page, { quantity: 2, location: "Kitchen" });
    await page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(page);

    const lots = await listInventoryLots(created.user.accessToken);
    expect(lots.some((lot) => lot.quantity === 2)).toBe(true);
  } finally {
    await context.close();
  }
});

test("B sees A's add, move, and remove after A syncs", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await openUserContext(browser);
  const b = await openUserContext(browser);

  try {
    const created = await signInAndCreateHousehold(a.page, "gap-move");
    await createProductFromInventory(a.page, "Shared flour");
    await addStock(a.page, { quantity: 5, location: "Kitchen" });
    await moveStock(a.page, { quantity: 2, source: "Kitchen", destination: "Cellar" });
    await removeStock(a.page, { quantity: 1, location: "Kitchen" });
    await a.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(a.page);

    await signInAndJoinHousehold(b.page, "gap-move-b", created.joinCode);
    await b.page.getByRole("link", { name: "Inventory" }).click();
    await expect(b.page.getByRole("link", { name: "Shared flour" })).toBeVisible();
    await expect(b.page.getByText("4 in stock")).toBeVisible();
    await b.page.getByRole("link", { name: "Shared flour", exact: true }).click();
    await expect(b.page.getByText("Kitchen: 2")).toBeVisible();
    await expect(b.page.getByText("Cellar: 2")).toBeVisible();

    await b.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(b.page);
    await expect(b.page.getByText("Total: 4")).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("B sees A's purchase and partial put-away", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await openUserContext(browser);
  const b = await openUserContext(browser);

  try {
    const created = await signInAndCreateHousehold(a.page, "gap-shop");
    await createProductFromInventory(a.page, "Shared rice");
    await openShopping(a.page);
    await addProductToShopping(a.page, "Shared rice", 3);
    await markPurchased(a.page, "Shared rice");
    await openPurchasedTab(a.page);
    await putAwayProduct(a.page, "Shared rice", 1, "Kitchen");
    await a.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(a.page);

    await signInAndJoinHousehold(b.page, "gap-shop-b", created.joinCode);
    await openShopping(b.page);
    await openPurchasedTab(b.page);
    await expect(b.page.getByText("2 remaining")).toBeVisible();
    await b.page.getByRole("link", { name: "Inventory" }).click();
    await expect(b.page.getByText("1 in stock")).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("B sees A's new category after sync", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await openUserContext(browser);
  const b = await openUserContext(browser);

  try {
    const created = await signInAndCreateHousehold(a.page, "gap-cat");
    await addNamedCategory(a.page, "Snacks");
    await a.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(a.page);

    await signInAndJoinHousehold(b.page, "gap-cat-b", created.joinCode);
    await b.page.getByRole("link", { name: "Settings" }).click();
    await b.page.getByRole("link", { name: "Categories" }).click();
    await expect(b.page.getByRole("heading", { name: "Snacks", exact: true })).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
