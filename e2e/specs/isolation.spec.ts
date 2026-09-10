import { expect, test } from "@playwright/test";
import {
  expectHome,
  expectHouseholdSetup,
  openUserContext,
  signInAndCreateHousehold,
  signInAndJoinHousehold,
  signInAs,
} from "../helpers/auth-ui";
import { skipIfNoLocalSupabase } from "../helpers/require-local";
import { listHouseholds, registerUser } from "../helpers/users";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test("A cannot read C's household; B shares A's household; A's cookies are not B's session", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const a = await openUserContext(browser);
  const b = await openUserContext(browser);
  const c = await openUserContext(browser);

  try {
    const createdA = await signInAndCreateHousehold(a.page, "iso-a");
    const userB = await signInAndJoinHousehold(b.page, "iso-b", createdA.joinCode);
    const createdC = await signInAndCreateHousehold(c.page, "iso-c");

    const aHouseholds = await listHouseholds(createdA.user.accessToken);
    const bHouseholds = await listHouseholds(userB.accessToken);
    const cHouseholds = await listHouseholds(createdC.user.accessToken);

    expect(aHouseholds.map((row) => row.id)).toEqual([createdA.householdId]);
    expect(bHouseholds.map((row) => row.id)).toEqual([createdA.householdId]);
    expect(cHouseholds.map((row) => row.id)).toEqual([createdC.householdId]);
    expect(createdC.householdId).not.toBe(createdA.householdId);

    const aCookies = await a.context.cookies();
    const bCookies = await b.context.cookies();
    expect(JSON.stringify(aCookies)).not.toEqual(JSON.stringify(bCookies));

    const aReplay = await browser.newContext({
      storageState: await a.context.storageState(),
    });
    try {
      const replayPage = await aReplay.newPage();
      await replayPage.goto("/");
      await expectHome(replayPage);
      await expect(replayPage.getByRole("heading", { name: "Set up household" })).toHaveCount(0);
    } finally {
      await aReplay.close();
    }

    const empty = await browser.newContext();
    try {
      const emptyPage = await empty.newPage();
      await emptyPage.goto("/");
      await expect(emptyPage.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await expect(emptyPage.getByRole("heading", { name: "Home", exact: true })).toHaveCount(0);
    } finally {
      await empty.close();
    }
  } finally {
    await a.context.close();
    await b.context.close();
    await c.context.close();
  }
});

test("signed-in user without a household stays on setup", async ({ browser }) => {
  const { context, page } = await openUserContext(browser);
  try {
    const user = await registerUser("iso-setup");
    await signInAs(page, user);
    await expectHouseholdSetup(page);
  } finally {
    await context.close();
  }
});
