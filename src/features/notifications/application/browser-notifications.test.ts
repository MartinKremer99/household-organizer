import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserNotifications,
  notificationPermissionState,
} from "./browser-notifications";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser notifications", () => {
  it("reports unsupported when Notification is missing", () => {
    vi.stubGlobal("Notification", undefined);
    expect(notificationPermissionState()).toBe("unsupported");
  });

  it("maps Notification.permission", () => {
    vi.stubGlobal("Notification", { permission: "default" });
    expect(notificationPermissionState()).toBe("default");
    vi.stubGlobal("Notification", { permission: "denied" });
    expect(notificationPermissionState()).toBe("denied");
    vi.stubGlobal("Notification", { permission: "granted" });
    expect(notificationPermissionState()).toBe("granted");
  });

  it("requestPermission is a no-op when unsupported or already denied", async () => {
    vi.stubGlobal("Notification", undefined);
    const unsupported = createBrowserNotifications();
    expect(await unsupported.requestPermission()).toBe("unsupported");

    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "denied", requestPermission });
    const denied = createBrowserNotifications();
    expect(await denied.requestPermission()).toBe("denied");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission only through requestPermission", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    const browser = createBrowserNotifications();
    expect(await browser.requestPermission()).toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("shows a page notification with tag and click navigation", () => {
    const shown: Array<{ title: string; options: NotificationOptions }> = [];
    const onclick: Array<() => void> = [];
    function FakeNotification(this: { onclick: (() => void) | null }, title: string, options: NotificationOptions) {
      shown.push({ title, options });
      this.onclick = null;
      onclick.push(() => {
        this.onclick?.();
      });
    }
    vi.stubGlobal("Notification", FakeNotification);
    const assign = vi.fn();
    const focus = vi.fn();
    vi.stubGlobal("window", { focus, location: { assign } });

    const browser = createBrowserNotifications();
    browser.show({
      title: "Low stock",
      body: "Milk: 1 in stock (min 4)",
      tag: "low:prod-1:1:4",
      url: "/inventory/prod-1",
    });

    expect(shown).toEqual([
      {
        title: "Low stock",
        options: { body: "Milk: 1 in stock (min 4)", tag: "low:prod-1:1:4" },
      },
    ]);
    onclick[0]();
    expect(focus).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/inventory/prod-1");
  });
});
