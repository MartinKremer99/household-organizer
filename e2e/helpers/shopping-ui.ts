import { expect, type Page } from "@playwright/test";

export async function openShopping(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shopping" })).toBeVisible();
}

export async function addProductToShopping(
  page: Page,
  productName: string,
  quantity: number,
): Promise<void> {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add to shopping" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Product" }).click();
  await dialog.getByLabel("Product").selectOption({ label: productName });
  await dialog.getByLabel("Quantity").fill(String(quantity));
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function addFreeTextToShopping(
  page: Page,
  text: string,
  quantity: number,
): Promise<void> {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add to shopping" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Free text" }).click();
  await dialog.getByLabel("What do you need?").fill(text);
  await dialog.getByLabel("Quantity").fill(String(quantity));
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function markPurchased(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Mark ${name} purchased` }).click();
}

export async function openPurchasedTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: /Purchased/ }).click();
}

export async function putAwayProduct(
  page: Page,
  name: string,
  quantity: number,
  location: string,
): Promise<void> {
  await page.getByRole("button", { name: `Put away ${name}` }).click();
  const dialog = page.getByRole("dialog", { name: `Put away ${name}` });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Quantity").fill(String(quantity));
  await dialog.getByLabel("Location").selectOption({ label: location });
  await dialog.getByRole("button", { name: "Put away" }).click();
  await expect(dialog).toBeHidden();
}

export async function markStored(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Mark ${name} stored` }).click();
}
