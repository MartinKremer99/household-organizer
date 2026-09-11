export type NotificationPermissionState =
  | "unsupported"
  | "default"
  | "denied"
  | "granted";

export type ShownNotification = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

export type BrowserNotifications = {
  permission: () => NotificationPermissionState;
  requestPermission: () => Promise<NotificationPermissionState>;
  show: (notification: ShownNotification) => void;
};

function notificationCtor(): typeof Notification | undefined {
  if (typeof Notification === "undefined") {
    return undefined;
  }
  return Notification;
}

export function notificationPermissionState(): NotificationPermissionState {
  const NotificationApi = notificationCtor();
  if (!NotificationApi) {
    return "unsupported";
  }
  if (NotificationApi.permission === "granted") {
    return "granted";
  }
  if (NotificationApi.permission === "denied") {
    return "denied";
  }
  return "default";
}

function mapPermission(value: NotificationPermission | string): NotificationPermissionState {
  if (value === "granted") {
    return "granted";
  }
  if (value === "denied") {
    return "denied";
  }
  if (value === "default") {
    return "default";
  }
  return "unsupported";
}

export function createBrowserNotifications(): BrowserNotifications {
  return {
    permission: notificationPermissionState,
    async requestPermission() {
      const current = notificationPermissionState();
      if (current === "unsupported" || current === "denied") {
        return current;
      }
      const NotificationApi = notificationCtor();
      if (!NotificationApi?.requestPermission) {
        return "unsupported";
      }
      const next = await NotificationApi.requestPermission();
      return mapPermission(next);
    },
    show(notification) {
      const NotificationApi = notificationCtor();
      if (!NotificationApi) {
        return;
      }
      const shown = new NotificationApi(notification.title, {
        body: notification.body,
        tag: notification.tag,
      });
      shown.onclick = () => {
        window.focus();
        window.location.assign(notification.url);
      };
    },
  };
}
