import { expect, type Page } from "@playwright/test";

export async function expectSynced(page: Page): Promise<void> {
  await expect(page.getByText("Syncing…")).toHaveCount(0);
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
}
