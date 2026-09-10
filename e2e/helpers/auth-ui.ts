import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  listHouseholds,
  registerUser,
  uniqueHouseholdName,
  type RegisteredUser,
} from "./users";

export async function openUserContext(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

export async function signInAs(page: Page, user: RegisteredUser): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function expectHome(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByText("Household", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading home…")).toHaveCount(0);
}

export async function expectHouseholdSetup(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Set up household" })).toBeVisible();
}

export async function createHouseholdFromSetup(
  page: Page,
  name: string,
): Promise<void> {
  await page.getByLabel("Household name").fill(name);
  await page.getByRole("button", { name: "Create household" }).click();
  await expectHome(page);
}

export async function joinHouseholdFromSetup(page: Page, joinCode: string): Promise<void> {
  await page.getByLabel("Join code").fill(joinCode);
  await page.getByRole("button", { name: "Join household" }).click();
  await expectHome(page);
}

export async function signInAndCreateHousehold(
  page: Page,
  label: string,
): Promise<{ user: RegisteredUser; householdName: string; householdId: string; joinCode: string }> {
  const user = await registerUser(label);
  const householdName = uniqueHouseholdName(label);
  await signInAs(page, user);
  await expectHouseholdSetup(page);
  await createHouseholdFromSetup(page, householdName);
  const households = await listHouseholds(user.accessToken);
  expect(households).toHaveLength(1);
  return {
    user,
    householdName,
    householdId: households[0].id,
    joinCode: households[0].join_code,
  };
}

export async function signInAndJoinHousehold(
  page: Page,
  label: string,
  joinCode: string,
): Promise<RegisteredUser> {
  const user = await registerUser(label);
  await signInAs(page, user);
  await expectHouseholdSetup(page);
  await joinHouseholdFromSetup(page, joinCode);
  return user;
}
