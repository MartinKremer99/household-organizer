"use client";

import { useEffect, useState } from "react";

type NetworkLabel = "offline" | "back_online" | null;

export function NetworkStatus() {
  const [label, setLabel] = useState<NetworkLabel>(() =>
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : null,
  );

  useEffect(() => {
    function onOffline() {
      setLabel("offline");
    }

    function onOnline() {
      setLabel("back_online");
    }

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (label === "offline") {
    return (
      <p className="text-xs" role="status">
        Offline
      </p>
    );
  }

  if (label === "back_online") {
    return (
      <p className="text-xs" role="status">
        Back online
      </p>
    );
  }

  return null;
}
