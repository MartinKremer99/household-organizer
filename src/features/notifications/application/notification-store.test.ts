import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_STATE,
  loadNotificationState,
  notificationStorageKey,
  saveNotificationState,
} from "./notification-store";

const HOUSEHOLD = "household-a";
const OTHER = "household-b";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    data,
  };
}

describe("notification store", () => {
  it("defaults both preferences off and has no seen keys", () => {
    expect(loadNotificationState(HOUSEHOLD, memoryStorage())).toEqual(
      DEFAULT_NOTIFICATION_STATE,
    );
    expect(DEFAULT_NOTIFICATION_STATE).toEqual({
      lowStock: false,
      expiration: false,
      seen: [],
    });
  });

  it("persists enable and disable across load", () => {
    const storage = memoryStorage();
    saveNotificationState(
      HOUSEHOLD,
      { lowStock: true, expiration: false, seen: [] },
      storage,
    );
    expect(loadNotificationState(HOUSEHOLD, storage)).toEqual({
      lowStock: true,
      expiration: false,
      seen: [],
    });

    saveNotificationState(
      HOUSEHOLD,
      { lowStock: false, expiration: true, seen: ["exp:1"] },
      storage,
    );
    expect(loadNotificationState(HOUSEHOLD, storage)).toEqual({
      lowStock: false,
      expiration: true,
      seen: ["exp:1"],
    });
  });

  it("scopes state by household", () => {
    const storage = memoryStorage();
    saveNotificationState(
      HOUSEHOLD,
      { lowStock: true, expiration: true, seen: ["low:a"] },
      storage,
    );

    expect(loadNotificationState(OTHER, storage)).toEqual(DEFAULT_NOTIFICATION_STATE);
    expect(storage.data[notificationStorageKey(HOUSEHOLD)]).toBeTruthy();
  });

  it("returns defaults when storage is missing or throws", () => {
    const throwing = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };

    expect(loadNotificationState(HOUSEHOLD, throwing)).toEqual(DEFAULT_NOTIFICATION_STATE);
    expect(() =>
      saveNotificationState(
        HOUSEHOLD,
        { lowStock: true, expiration: false, seen: [] },
        throwing,
      ),
    ).not.toThrow();
    expect(loadNotificationState(HOUSEHOLD, null)).toEqual(DEFAULT_NOTIFICATION_STATE);
  });

  it("returns defaults for invalid stored JSON", () => {
    const storage = memoryStorage({
      [notificationStorageKey(HOUSEHOLD)]: "{not-json",
    });
    expect(loadNotificationState(HOUSEHOLD, storage)).toEqual(DEFAULT_NOTIFICATION_STATE);
  });
});
