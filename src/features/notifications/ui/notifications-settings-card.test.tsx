/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_STATE } from "@/features/notifications/application/notification-store";
import {
  NotificationsSettingsCard,
  type NotificationsSettingsCardApi,
} from "./notifications-settings-card";

const HOUSEHOLD = "household-a";

function api(overrides: Partial<NotificationsSettingsCardApi> = {}): NotificationsSettingsCardApi {
  return {
    permission: () => "default",
    requestPermission: vi.fn().mockResolvedValue("granted"),
    loadState: vi.fn().mockReturnValue(DEFAULT_NOTIFICATION_STATE),
    saveState: vi.fn(),
    evaluateHouseholdNotifications: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderCard(control: NotificationsSettingsCardApi = api()) {
  return render(<NotificationsSettingsCard householdId={HOUSEHOLD} api={control} />);
}

afterEach(() => {
  cleanup();
});

describe("NotificationsSettingsCard", () => {
  it("shows unsupported state without Enable and with disabled toggles", () => {
    renderCard(api({ permission: () => "unsupported" }));

    expect(screen.getByRole("heading", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByText("Browser does not support notifications")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable notifications" })).toBeNull();
    expect(screen.getByRole("button", { name: "Low stock" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Expiration" })).toHaveProperty("disabled", true);
  });

  it("shows not permitted and does not request permission on mount", () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    renderCard(api({ requestPermission }));

    expect(screen.getByText("Browser notifications: Not permitted")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable notifications" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Low stock" })).toHaveProperty("disabled", true);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission only from Enable and then unlocks toggles", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    renderCard(api({ requestPermission }));

    fireEvent.click(screen.getByRole("button", { name: "Enable notifications" }));

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Browser notifications: Allowed")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Low stock" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Expiration" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("button", { name: "Enable notifications" })).toBeNull();
  });

  it("explains denied permission and does not request again", () => {
    const requestPermission = vi.fn();
    renderCard(api({ permission: () => "denied", requestPermission }));

    expect(screen.getByText("Browser notifications: Not permitted")).toBeTruthy();
    expect(
      screen.getByText("Notifications were blocked. Use the browser settings to allow them."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable notifications" })).toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("persists a toggle and evaluates only when turned on", async () => {
    const saveState = vi.fn();
    const evaluateHouseholdNotifications = vi.fn().mockResolvedValue(undefined);
    renderCard(
      api({
        permission: () => "granted",
        saveState,
        evaluateHouseholdNotifications,
      }),
    );

    const lowStock = screen.getByRole("button", { name: "Low stock" });
    expect(lowStock.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(lowStock);

    await waitFor(() => {
      expect(saveState).toHaveBeenCalledWith(HOUSEHOLD, {
        lowStock: true,
        expiration: false,
        seen: [],
      });
      expect(evaluateHouseholdNotifications).toHaveBeenCalledWith(HOUSEHOLD);
    });
    expect(lowStock.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(lowStock);
    await waitFor(() => {
      expect(saveState).toHaveBeenLastCalledWith(HOUSEHOLD, {
        lowStock: false,
        expiration: false,
        seen: [],
      });
    });
    expect(evaluateHouseholdNotifications).toHaveBeenCalledTimes(1);
  });
});
