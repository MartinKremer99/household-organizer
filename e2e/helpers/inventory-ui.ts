import { expect, type Page } from "@playwright/test";

export async function createProductFromInventory(
  page: Page,
  name: string,
  options?: { minimumStock?: number },
): Promise<void> {
  await page.getByRole("link", { name: "Inventory", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await page.getByRole("button", { name: "Add product" }).click();
  const dialog = page.getByRole("dialog", { name: "Add product" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name").fill(name);
  if (options?.minimumStock != null) {
    await dialog.getByLabel("Minimum stock").fill(String(options.minimumStock));
  }
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
}

export async function addStock(
  page: Page,
  options: { quantity: number; location: string; expiration?: string },
): Promise<void> {
  await page.getByRole("button", { name: "Add stock" }).click();
  const dialog = page.getByRole("dialog", { name: "Add stock" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Quantity").fill(String(options.quantity));
  await dialog.getByLabel("Location").selectOption({ label: options.location });
  if (options.expiration) {
    await dialog.getByLabel("Expiration date").fill(options.expiration);
  }
  await dialog.getByRole("button", { name: "Add stock" }).click();
  await expect(dialog).toBeHidden();
}

export async function moveStock(
  page: Page,
  options: { quantity: number; source: string; destination: string },
): Promise<void> {
  await page.getByRole("button", { name: "Move", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Move" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Source").selectOption({ label: options.source });
  await dialog.getByLabel("Destination").selectOption({ label: options.destination });
  await dialog.getByLabel("Quantity").fill(String(options.quantity));
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function removeStock(
  page: Page,
  options: { quantity: number; location: string; lot?: string },
): Promise<void> {
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remove" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Location").selectOption({ label: options.location });
  if (options.lot) {
    await dialog.getByLabel("Lot").selectOption({ label: options.lot });
  }
  await dialog.getByLabel("Quantity").fill(String(options.quantity));
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function openProductFromInventory(page: Page, name: string): Promise<void> {
  await page.getByRole("link", { name: "Inventory", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
}
