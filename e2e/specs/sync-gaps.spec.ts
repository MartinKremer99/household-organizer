import { expect, test } from "@playwright/test";
import {
  expectHome,
  openUserContext,
  signInAndCreateHousehold,
  signInAndJoinHousehold,
} from "../helpers/auth-ui";
import { seedCatalog } from "../helpers/catalog-ui";
import { addStock, createProductFromInventory } from "../helpers/inventory-ui";
import { skipIfNoLocalSupabase } from "../helpers/require-local";
import { listInventoryLots } from "../helpers/users";

test.beforeAll(async () => {
  await skipIfNoLocalSupabase();
});

test.fixme(
  "B Inventory UI shows A's quantity after A syncs — production has no pull",
  async ({ browser }) => {
    const a = await openUserContext(browser);
    const b = await openUserContext(browser);

    try {
      const created = await signInAndCreateHousehold(a.page, "gap-a");
      await seedCatalog(a.page);
      await createProductFromInventory(a.page, "Shared oats");
      await addStock(a.page, { quantity: 4, location: "Kitchen" });
      await a.page.getByRole("button", { name: "Sync now" }).click();
      await expect(a.page.getByText("Synced")).toBeVisible();

      await signInAndJoinHousehold(b.page, "gap-b", created.joinCode);
      await expectHome(b.page);
      await b.page.getByRole("link", { name: "Inventory" }).click();
      await expect(b.page.getByRole("heading", { name: "Inventory" })).toBeVisible();
      await expect(b.page.getByRole("link", { name: "Shared oats" })).toBeVisible();
      await expect(b.page.getByText("4 in stock")).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  },
);

test.fixme(
  "Add stock persists after UI household create — production never writes a Dexie households row",
  async ({ browser }) => {
    const { context, page } = await openUserContext(browser);

    try {
      await signInAndCreateHousehold(page, "gap-dexie");
      await seedCatalog(page);
      await createProductFromInventory(page, "Blocked oats");
      await addStock(page, { quantity: 2, location: "Kitchen" });
      await expect(page.getByText("Total: 2")).toBeVisible();
    } finally {
      await context.close();
    }
  },
);

test.fixme(
  "Sync now uploads UI-created stock — production has no Dexie membership or catalog outbox",
  async ({ browser }) => {
    const { context, page } = await openUserContext(browser);

    try {
      const created = await signInAndCreateHousehold(page, "gap-sync");
      await seedCatalog(page);
      await createProductFromInventory(page, "Uploaded oats");
      await addStock(page, { quantity: 2, location: "Kitchen" });
      await page.getByRole("button", { name: "Sync now" }).click();
      await expect(page.getByText("Synced")).toBeVisible();

      const lots = await listInventoryLots(created.user.accessToken);
      expect(lots.some((lot) => lot.quantity === 2)).toBe(true);
    } finally {
      await context.close();
    }
  },
);
