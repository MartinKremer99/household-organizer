import { expect, test } from "@playwright/test";
import {
  openUserContext,
  signInAndCreateHousehold,
  signInAndJoinHousehold,
} from "../helpers/auth-ui";
import { seedCatalog } from "../helpers/catalog-ui";
import { createProductFromInventory } from "../helpers/inventory-ui";
import { openSettings } from "../helpers/settings-ui";
import { expectSynced } from "../helpers/sync-ui";
import { skipIfNoLocalSupabase } from "../helpers/require-local";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test("typed barcode creates a product and syncs to another member", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const a = await openUserContext(browser);
  const b = await openUserContext(browser);

  try {
    const created = await signInAndCreateHousehold(a.page, "bar-a");
    await seedCatalog(a.page);
    await a.page.getByRole("link", { name: "Inventory", exact: true }).click();
    await expect(a.page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await a.page.getByRole("button", { name: "Add product" }).click();

    const addDialog = a.page.getByRole("dialog", { name: "Add product" });
    await expect(addDialog).toBeVisible();
    await expect(addDialog.getByLabel("Barcode")).toBeVisible();
    await expect(addDialog.getByRole("button", { name: "Scan barcode" })).toBeVisible();

    await addDialog.getByRole("button", { name: "Scan barcode" }).click();
    const scanDialog = a.page.getByRole("dialog", { name: "Scan barcode" });
    await expect(scanDialog).toBeVisible();
    await expect(
      scanDialog.getByText(
        /This browser cannot scan barcodes|Could not open the camera/,
      ),
    ).toBeVisible();
    await scanDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(scanDialog).toBeHidden();
    await expect(addDialog).toBeVisible();
    await addDialog.getByRole("button", { name: "Cancel" }).click();

    await createProductFromInventory(a.page, "Cola", {
      barcode: "5449000000996",
    });
    await expect(a.page.getByText("5449000000996")).toBeVisible();

    await a.page.getByRole("link", { name: "Inventory", exact: true }).click();
    await expect(a.page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await a.page.getByRole("button", { name: "Add product" }).click();
    const duplicateDialog = a.page.getByRole("dialog", { name: "Add product" });
    await expect(duplicateDialog).toBeVisible();
    await duplicateDialog.getByLabel("Name").fill("Cola two");
    await duplicateDialog.getByLabel("Barcode").fill("5449000000996");
    await duplicateDialog.getByRole("button", { name: "Save" }).click();
    await expect(duplicateDialog.getByRole("alert")).toHaveText("That barcode is already used.");
    await expect(duplicateDialog).toBeVisible();
    await duplicateDialog.getByRole("button", { name: "Cancel" }).click();

    await a.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(a.page);

    await signInAndJoinHousehold(b.page, "bar-b", created.joinCode);
    await b.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(b.page);
    await openSettings(b.page);
    await b.page.getByRole("link", { name: "Products" }).click();
    await expect(b.page.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(b.page.getByRole("heading", { name: "Cola" })).toBeVisible();
    await expect(b.page.getByText("5449000000996")).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
