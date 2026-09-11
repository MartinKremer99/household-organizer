export type NotificationState = {
  lowStock: boolean;
  expiration: boolean;
  seen: string[];
};

export type NotificationStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
} | null;

export const DEFAULT_NOTIFICATION_STATE: NotificationState = {
  lowStock: false,
  expiration: false,
  seen: [],
};

export function notificationStorageKey(householdId: string): string {
  return `household-organizer:notifications:${householdId}`;
}

function browserStorage(): NotificationStorage {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function isState(value: unknown): value is NotificationState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as NotificationState;
  return (
    typeof row.lowStock === "boolean" &&
    typeof row.expiration === "boolean" &&
    Array.isArray(row.seen) &&
    row.seen.every((key) => typeof key === "string")
  );
}

export function loadNotificationState(
  householdId: string,
  storage: NotificationStorage = browserStorage(),
): NotificationState {
  if (!storage) {
    return { ...DEFAULT_NOTIFICATION_STATE, seen: [] };
  }
  try {
    const raw = storage.getItem(notificationStorageKey(householdId));
    if (!raw) {
      return { ...DEFAULT_NOTIFICATION_STATE, seen: [] };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isState(parsed)) {
      return { ...DEFAULT_NOTIFICATION_STATE, seen: [] };
    }
    return {
      lowStock: parsed.lowStock,
      expiration: parsed.expiration,
      seen: [...parsed.seen],
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_STATE, seen: [] };
  }
}

export function saveNotificationState(
  householdId: string,
  state: NotificationState,
  storage: NotificationStorage = browserStorage(),
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(notificationStorageKey(householdId), JSON.stringify(state));
  } catch {
    // Private mode or quota. Evaluation and Settings must not crash.
  }
}

export type NotificationStore = {
  load: (householdId: string) => NotificationState;
  save: (householdId: string, state: NotificationState) => void;
};

export function createNotificationStore(
  storage: NotificationStorage = browserStorage(),
): NotificationStore {
  return {
    load: (householdId) => loadNotificationState(householdId, storage),
    save: (householdId, state) => saveNotificationState(householdId, state, storage),
  };
}
