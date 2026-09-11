/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Household } from "@/lib/db";
import { HouseholdAppChrome } from "./household-app-chrome";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const HOUSEHOLD: Household = {
  id: "household-a",
  name: "Home",
  join_code: "ABCDEFGHIJ",
  created_at: "2026-09-10T12:00:00.000Z",
  updated_at: "2026-09-10T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
});

describe("HouseholdAppChrome", () => {
  it("evaluates notifications with household.id on ready and does not request permission", async () => {
    const evaluateHouseholdNotifications = vi.fn().mockResolvedValue(undefined);
    const ensureLocalHousehold = vi.fn().mockResolvedValue({
      ok: true,
      household: HOUSEHOLD,
    });

    render(
      <HouseholdAppChrome
        userId="user-1"
        api={{
          ensureLocalHousehold,
          evaluateHouseholdNotifications,
        }}
      >
        <p>Ready</p>
      </HouseholdAppChrome>,
    );

    expect(await screen.findByText("Ready")).toBeTruthy();
    await waitFor(() => {
      expect(evaluateHouseholdNotifications).toHaveBeenCalledWith("household-a");
    });
    expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
  });
});
