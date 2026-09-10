import { expect, type Page } from "@playwright/test";

async function saveNamedCatalogItem(
  page: Page,
  openLabel: string,
  dialogTitle: string,
  name: string,
): Promise<void> {
  const openButton = page.getByRole("button", { name: openLabel });
  const dialog = page.getByRole("dialog", { name: dialogTitle });
  await expect(openButton).toBeEnabled();
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await openButton.click();
    }
    await expect(dialog).toBeVisible();
  }).toPass();
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

export async function seedCatalog(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByRole("link", { name: "Categories" }).click();
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
  await expect(page.getByText("No categories yet.")).toBeVisible();
  await saveNamedCatalogItem(page, "Add category", "Add category", "Food");

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("link", { name: "Locations" }).click();
  await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible();
  await expect(page.getByText("No locations yet.")).toBeVisible();
  await saveNamedCatalogItem(page, "Add location", "Add location", "Kitchen");
  await saveNamedCatalogItem(page, "Add location", "Add location", "Cellar");
}
