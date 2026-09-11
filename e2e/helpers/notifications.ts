import { expect, type BrowserContext, type Page } from "@playwright/test";

export type StubbedNotification = {
  title: string;
  body?: string;
  tag?: string;
};

export async function stubPageNotifications(
  context: BrowserContext,
  options?: { permission?: NotificationPermission },
): Promise<void> {
  await context.addInitScript((initial: NotificationPermission) => {
    let permission = initial;
    const shown: Array<{ title: string; body?: string; tag?: string }> = [];
    class SpyNotification {
      static get permission(): NotificationPermission {
        return permission;
      }
      static requestPermission() {
        permission = "granted";
        return Promise.resolve("granted" as NotificationPermission);
      }
      onclick: (() => void) | null = null;
      constructor(title: string, options?: NotificationOptions) {
        shown.push({ title, body: options?.body, tag: options?.tag });
      }
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: SpyNotification,
    });
    Object.defineProperty(window, "__hoNotifications", {
      configurable: true,
      value: shown,
    });
  }, options?.permission ?? "granted");
}

export async function readStubbedNotifications(page: Page): Promise<StubbedNotification[]> {
  return page.evaluate(() => {
    const recorded = (
      window as unknown as { __hoNotifications?: StubbedNotification[] }
    ).__hoNotifications;
    return recorded ? [...recorded] : [];
  });
}

export async function expectStubbedNotification(
  page: Page,
  match: { title: string; body: string },
): Promise<void> {
  await expect
    .poll(async () => readStubbedNotifications(page))
    .toEqual(expect.arrayContaining([expect.objectContaining(match)]));
}
