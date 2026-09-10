import { expect, test } from "@playwright/test";
import { expectHome, openUserContext, signInAndCreateHousehold } from "../helpers/auth-ui";
import { startRequestLog, waitForServiceWorker } from "../helpers/network";
import { skipIfNoLocalSupabase } from "../helpers/require-local";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test("manifest and service worker are available without signing in", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const body = (await manifest.json()) as { name?: string };
  expect(body.name).toBe("Household Organizer");

  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain("household-shell-v1");
});

test("signed-in PWA chrome stays up offline and does not auto-sync", async ({ browser }) => {
  const { context, page } = await openUserContext(browser);
  const log = startRequestLog(page);

  try {
    await signInAndCreateHousehold(page, "pwa-a");
    await expectHome(page);
    await waitForServiceWorker(page);
    await expect(page.getByText("Household", { exact: true })).toBeVisible();

    log.clear();
    await context.setOffline(true);
    await expect(page.getByText("Offline", { exact: true })).toBeVisible();
    await expect(page.getByText("Household", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    expect(log.rpcHits("apply_inventory_command")).toEqual([]);

    await context.setOffline(false);
    await expect(page.getByText("Back online", { exact: true })).toBeVisible();
    expect(log.rpcHits("apply_inventory_command")).toEqual([]);
  } finally {
    await context.close();
  }
});
