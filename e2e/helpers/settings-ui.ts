import { expect, type Page } from "@playwright/test";

export async function openSettings(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Loading household…")).toHaveCount(0);
}

export async function expectHouseholdName(page: Page, name: string): Promise<void> {
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

export async function renameHouseholdFromSettings(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Rename" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename household" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Household name").fill(name);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await expectHouseholdName(page, name);
}

export async function copyJoinCode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Copy join code" }).click();
  await expect(page.getByText("Copied.", { exact: true })).toBeVisible();
}
