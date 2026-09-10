import { expect, test } from "@playwright/test";
import { openUserContext, signInAndCreateHousehold } from "../helpers/auth-ui";
import { seedCatalog } from "../helpers/catalog-ui";
import { createProductFromInventory } from "../helpers/inventory-ui";
import { skipIfNoLocalSupabase } from "../helpers/require-local";
import {
  addFreeTextToShopping,
  addProductToShopping,
  markPurchased,
  markStored,
  openPurchasedTab,
  openShopping,
  putAwayProduct,
} from "../helpers/shopping-ui";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test(
  "product shopping can be purchased and partially put away",
  async ({ browser }) => {
  const { context, page } = await openUserContext(browser);

  try {
    await signInAndCreateHousehold(page, "shop-a");
    await seedCatalog(page);
    await createProductFromInventory(page, "Rice");
    await openShopping(page);

    await addProductToShopping(page, "Rice", 3);
    await expect(page.getByRole("heading", { name: "Rice", exact: true })).toBeVisible();
    await markPurchased(page, "Rice");
    await openPurchasedTab(page);
    await expect(page.getByText("3 remaining")).toBeVisible();

    await putAwayProduct(page, "Rice", 1, "Kitchen");
    await expect(page.getByText("2 remaining")).toBeVisible();

    await putAwayProduct(page, "Rice", 2, "Kitchen");
    await expect(page.getByText("Nothing waiting to be stored.")).toBeVisible();

    await page.getByRole("link", { name: "Inventory" }).click();
    await expect(page.getByText("3 in stock")).toBeVisible();
  } finally {
    await context.close();
  }
});

test(
  "free-text shopping is stored without creating inventory",
  async ({ browser }) => {
  const { context, page } = await openUserContext(browser);

  try {
    await signInAndCreateHousehold(page, "shop-note");
    await seedCatalog(page);
    await openShopping(page);

    await addFreeTextToShopping(page, "Paper towels", 1);
    await expect(page.getByRole("heading", { name: "Paper towels" })).toBeVisible();
    await expect(page.getByText("Note")).toBeVisible();
    await markPurchased(page, "Paper towels");
    await openPurchasedTab(page);
    await markStored(page, "Paper towels");
    await expect(page.getByText("Nothing waiting to be stored.")).toBeVisible();

    await page.getByRole("link", { name: "Inventory" }).click();
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Paper towels" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
