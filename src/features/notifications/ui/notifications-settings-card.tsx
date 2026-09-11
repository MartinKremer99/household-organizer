"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createBrowserNotifications,
  type NotificationPermissionState,
} from "@/features/notifications/application/browser-notifications";
import { evaluateHouseholdNotifications } from "@/features/notifications/application/evaluate-notifications";
import {
  createNotificationStore,
  type NotificationState,
} from "@/features/notifications/application/notification-store";

export type NotificationsSettingsCardApi = {
  permission: () => NotificationPermissionState;
  requestPermission: () => Promise<NotificationPermissionState>;
  loadState: (householdId: string) => NotificationState;
  saveState: (householdId: string, state: NotificationState) => void;
  evaluateHouseholdNotifications: typeof evaluateHouseholdNotifications;
};

const browser = createBrowserNotifications();
const store = createNotificationStore();

const defaults: NotificationsSettingsCardApi = {
  permission: browser.permission,
  requestPermission: browser.requestPermission,
  loadState: store.load,
  saveState: store.save,
  evaluateHouseholdNotifications,
};

export function NotificationsSettingsCard({
  householdId,
  api,
}: {
  householdId: string;
  api?: Partial<NotificationsSettingsCardApi>;
}) {
  const client = useMemo(() => ({ ...defaults, ...api }), [api]);
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    client.permission(),
  );
  const [state, setState] = useState<NotificationState>(() => client.loadState(householdId));
  const togglesEnabled = permission === "granted";

  async function enableNotifications() {
    const next = await client.requestPermission();
    setPermission(next);
  }

  async function setToggle(key: "lowStock" | "expiration", enabled: boolean) {
    const next = { ...state, [key]: enabled };
    client.saveState(householdId, next);
    setState(next);
    if (enabled) {
      await client.evaluateHouseholdNotifications(householdId);
    }
  }

  return (
    <Card title="Notifications">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>Low stock</p>
          <Button
            type="button"
            variant="secondary"
            disabled={!togglesEnabled}
            aria-pressed={state.lowStock}
            onClick={() => {
              void setToggle("lowStock", !state.lowStock);
            }}
          >
            Low stock
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>Expiration</p>
          <Button
            type="button"
            variant="secondary"
            disabled={!togglesEnabled}
            aria-pressed={state.expiration}
            onClick={() => {
              void setToggle("expiration", !state.expiration);
            }}
          >
            Expiration
          </Button>
        </div>

        {permission === "unsupported" ? (
          <p>Browser does not support notifications</p>
        ) : (
          <p>
            Browser notifications:{" "}
            {permission === "granted" ? "Allowed" : "Not permitted"}
          </p>
        )}

        {permission === "denied" ? (
          <p>Notifications were blocked. Use the browser settings to allow them.</p>
        ) : null}

        {permission === "default" ? (
          <Button type="button" variant="secondary" onClick={() => void enableNotifications()}>
            Enable notifications
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
