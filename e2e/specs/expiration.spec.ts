import { expect, test } from "@playwright/test";
import { expectHome, openUserContext, signInAndCreateHousehold } from "../helpers/auth-ui";
import { seedCatalog } from "../helpers/catalog-ui";
import { localIsoDate } from "../helpers/dates";
import {
  addStock,
  createProductFromInventory,
  removeStock,
} from "../helpers/inventory-ui";
import { skipIfNoLocalSupabase } from "../helpers/require-local";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test(
  "dated lots appear on the product and Home until they are removed",
  async ({ browser }) => {
  const { context, page } = await openUserContext(browser);
  const soon = localIsoDate(3);
  const expired = localIsoDate(-1);

  try {
    await signInAndCreateHousehold(page, "exp-a");
    await seedCatalog(page);
    await createProductFromInventory(page, "Yogurt");

    await addStock(page, { quantity: 1, location: "Kitchen", expiration: soon });
    await expect(page.getByText(soon)).toBeVisible();
    await expect(page.getByText("in 3 days")).toBeVisible();

    await page.getByRole("link", { name: "Home" }).click();
    await expectHome(page);
    await expect(page.getByRole("heading", { name: "Expiring soon" })).toBeVisible();
    await expect(page.getByRole("link", { name: `Yogurt · ${soon}` })).toBeVisible();

    await page.getByRole("link", { name: `Yogurt · ${soon}` }).click();
    await addStock(page, { quantity: 1, location: "Kitchen", expiration: expired });
    await expect(page.getByText(expired)).toBeVisible();
    await expect(page.getByText("Expired")).toBeVisible();
    await expect(page.getByText(soon)).toBeVisible();

    await removeStock(page, {
      quantity: 1,
      location: "Kitchen",
      lot: `Kitchen · 1 · ${expired}`,
    });
    await expect(page.getByText("Expired")).toHaveCount(0);
    await expect(page.getByText(expired)).toHaveCount(0);
    await expect(page.getByText(soon)).toBeVisible();
    await expect(page.getByText("Total: 1")).toBeVisible();
  } finally {
    await context.close();
  }
});
