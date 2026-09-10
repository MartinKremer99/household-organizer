/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Household } from "@/lib/db";
import { HouseholdHydrationGate } from "./household-hydration-gate";

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

describe("HouseholdHydrationGate", () => {
  it("renders children after a successful ensure", async () => {
    const ensure = vi.fn().mockResolvedValue({ ok: true, household: HOUSEHOLD });

    render(
      <HouseholdHydrationGate userId="user-1" api={{ ensureLocalHousehold: ensure }}>
        <p>Ready</p>
      </HouseholdHydrationGate>,
    );

    expect(screen.getByText("Loading household…")).toBeTruthy();
    expect(await screen.findByText("Ready")).toBeTruthy();
    expect(ensure).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("shows retry when ensure fails and retries on click", async () => {
    const ensure = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "transient_error" })
      .mockResolvedValueOnce({ ok: true, household: HOUSEHOLD });

    render(
      <HouseholdHydrationGate userId="user-1" api={{ ensureLocalHousehold: ensure }}>
        <p>Ready</p>
      </HouseholdHydrationGate>,
    );

    expect(await screen.findByText("Could not load household")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Ready")).toBeTruthy();
    expect(ensure).toHaveBeenCalledTimes(2);
  });
});
