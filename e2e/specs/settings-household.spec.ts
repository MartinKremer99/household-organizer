import { expect, test } from "@playwright/test";
import {
  openUserContext,
  signInAndCreateHousehold,
  signInAndJoinHousehold,
} from "../helpers/auth-ui";
import { countPendingOperations } from "../helpers/dexie";
import { startRequestLog } from "../helpers/network";
import { skipIfNoLocalSupabase } from "../helpers/require-local";
import {
  copyJoinCode,
  expectHouseholdName,
  openSettings,
  renameHouseholdFromSettings,
} from "../helpers/settings-ui";
import { expectSynced } from "../helpers/sync-ui";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test("A renames the household, B sees it, and C stays isolated", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await openUserContext(browser, {
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const b = await openUserContext(browser);
  const c = await openUserContext(browser);

  try {
    const created = await signInAndCreateHousehold(a.page, "set-a");
    await openSettings(a.page);
    await expectHouseholdName(a.page, created.householdName);
    await expect(a.page.getByText(created.joinCode, { exact: true })).toBeVisible();

    const renamed = `Renamed ${Date.now().toString(36)}`;
    await renameHouseholdFromSettings(a.page, renamed);
    await expectHouseholdName(a.page, renamed);
    await a.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(a.page);

    await signInAndJoinHousehold(b.page, "set-b", created.joinCode);
    await openSettings(b.page);
    await expectHouseholdName(b.page, renamed);
    await expect(b.page.getByText(created.householdName, { exact: true })).toHaveCount(0);

    await b.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(b.page);
    await b.page.getByRole("link", { name: "Home" }).click();
    await openSettings(b.page);
    await expectHouseholdName(b.page, renamed);

    await copyJoinCode(a.page);

    const other = await signInAndCreateHousehold(c.page, "set-c");
    await openSettings(c.page);
    await expectHouseholdName(c.page, other.householdName);
    await expect(c.page.getByText(renamed, { exact: true })).toHaveCount(0);
    await expect(c.page.getByText(created.joinCode, { exact: true })).toHaveCount(0);
    await expect(c.page.getByText(other.joinCode, { exact: true })).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
    await c.context.close();
  }
});

test("offline rename stays local until Sync now", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await openUserContext(browser);
  const b = await openUserContext(browser);
  const log = startRequestLog(a.page);

  try {
    const created = await signInAndCreateHousehold(a.page, "set-off");
    await openSettings(a.page);
    await a.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(a.page);

    const before = await countPendingOperations(a.page);
    log.clear();
    await a.context.setOffline(true);
    await expect(a.page.getByText("Offline", { exact: true })).toBeVisible();

    const renamed = `Offline ${Date.now().toString(36)}`;
    await renameHouseholdFromSettings(a.page, renamed);
    await expectHouseholdName(a.page, renamed);
    expect(await countPendingOperations(a.page)).toBeGreaterThan(before);
    expect(log.supabaseHits()).toEqual([]);

    await a.context.setOffline(false);
    await expect(a.page.getByText("Back online", { exact: true })).toBeVisible();
    expect(log.rpcHits("apply_household_command")).toEqual([]);

    await a.page.getByRole("button", { name: "Sync now" }).click();
    await expectSynced(a.page);

    await signInAndJoinHousehold(b.page, "set-off-b", created.joinCode);
    await openSettings(b.page);
    await expectHouseholdName(b.page, renamed);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
