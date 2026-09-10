import { expect, test } from "@playwright/test";
import {
  createHouseholdFromSetup,
  expectHome,
  expectHouseholdSetup,
  openUserContext,
  signInAndCreateHousehold,
  signInAndJoinHousehold,
  signInAs,
} from "../helpers/auth-ui";
import { skipIfNoLocalSupabase } from "../helpers/require-local";
import { listHouseholds, registerUser, uniqueHouseholdName } from "../helpers/users";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test("A creates a household, B joins, C stays on setup", async ({ browser }) => {
  const a = await openUserContext(browser);
  const b = await openUserContext(browser);
  const c = await openUserContext(browser);

  try {
    const created = await signInAndCreateHousehold(a.page, "auth-a");
    await expectHome(a.page);

    await signInAndJoinHousehold(b.page, "auth-b", created.joinCode);
    await expectHome(b.page);

    const userC = await registerUser("auth-c");
    await signInAs(c.page, userC);
    await expectHouseholdSetup(c.page);
    await expect(c.page.getByRole("heading", { name: "Home", exact: true })).toHaveCount(0);

    const aHouseholds = await listHouseholds(created.user.accessToken);
    expect(aHouseholds).toEqual([{ id: created.householdId, join_code: created.joinCode }]);
  } finally {
    await a.context.close();
    await b.context.close();
    await c.context.close();
  }
});

test("create household from the setup form reaches Home", async ({ browser }) => {
  const { context, page } = await openUserContext(browser);
  try {
    const user = await registerUser("auth-create");
    await signInAs(page, user);
    await expectHouseholdSetup(page);
    await createHouseholdFromSetup(page, uniqueHouseholdName("auth-create"));
  } finally {
    await context.close();
  }
});
