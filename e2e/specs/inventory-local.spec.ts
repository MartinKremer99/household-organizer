import { expect, test } from "@playwright/test";
import { openUserContext, signInAndCreateHousehold } from "../helpers/auth-ui";
import { seedCatalog } from "../helpers/catalog-ui";
import {
  addStock,
  createProductFromInventory,
  moveStock,
  removeStock,
} from "../helpers/inventory-ui";
import { skipIfNoLocalSupabase } from "../helpers/require-local";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test.fixme(
  "local inventory add, move, and remove update the product UI — production never writes a Dexie household row after create",
  async ({ browser }) => {
  const { context, page } = await openUserContext(browser);

  try {
    await signInAndCreateHousehold(page, "inv-a");
    await seedCatalog(page);
    await createProductFromInventory(page, "Milk");

    await addStock(page, { quantity: 4, location: "Kitchen" });
    await expect(page.getByText("Total: 4")).toBeVisible();
    await expect(page.getByText("Kitchen: 4")).toBeVisible();

    await moveStock(page, { quantity: 2, source: "Kitchen", destination: "Cellar" });
    await expect(page.getByText("Total: 4")).toBeVisible();
    await expect(page.getByText("Kitchen: 2")).toBeVisible();
    await expect(page.getByText("Cellar: 2")).toBeVisible();

    await removeStock(page, { quantity: 1, location: "Kitchen" });
    await expect(page.getByText("Total: 3")).toBeVisible();
    await expect(page.getByText("Kitchen: 1")).toBeVisible();
    await expect(page.getByText("Cellar: 2")).toBeVisible();

    await page.getByRole("link", { name: "Back to inventory" }).click();
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByText("3 in stock")).toBeVisible();
    await expect(page.getByText("Kitchen 1 · Cellar 2")).toBeVisible();
  } finally {
    await context.close();
  }
});
