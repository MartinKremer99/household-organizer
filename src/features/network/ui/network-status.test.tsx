/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NetworkStatus } from "./network-status";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  cleanup();
  setOnline(true);
});

describe("NetworkStatus", () => {
  it("renders nothing while the browser is online", () => {
    setOnline(true);
    render(<NetworkStatus />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Synced")).toBeNull();
  });

  it("shows Offline when the browser goes offline", () => {
    setOnline(true);
    render(<NetworkStatus />);
    setOnline(false);
    fireEvent(window, new Event("offline"));
    expect(screen.getByRole("status").textContent).toBe("Offline");
    expect(screen.queryByText("Synced")).toBeNull();
  });

  it("shows Back online after connectivity returns", () => {
    setOnline(true);
    render(<NetworkStatus />);
    setOnline(false);
    fireEvent(window, new Event("offline"));
    setOnline(true);
    fireEvent(window, new Event("online"));
    expect(screen.getByRole("status").textContent).toBe("Back online");
    expect(screen.queryByText("Synced")).toBeNull();
  });
});
