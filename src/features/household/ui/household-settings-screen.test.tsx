/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HouseholdSettingsScreen,
  type HouseholdSettingsScreenApi,
} from "./household-settings-screen";

const HOUSEHOLD = {
  id: "household-a",
  name: "Home",
  join_code: "ABCDEFGHIJ",
  created_at: "2026-09-10T12:00:00.000Z",
  updated_at: "2026-09-10T12:00:00.000Z",
};

function api(overrides: Partial<HouseholdSettingsScreenApi> = {}): HouseholdSettingsScreenApi {
  return {
    getLocalHousehold: vi.fn().mockResolvedValue(HOUSEHOLD),
    renameHousehold: vi.fn().mockResolvedValue({
      ok: true,
      value: { ...HOUSEHOLD, name: "New Home" },
    }),
    copyText: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("HouseholdSettingsScreen", () => {
  it("renders household name, join code, email, sign out, and catalog links", async () => {
    render(
      <HouseholdSettingsScreen
        householdId={HOUSEHOLD.id}
        email="member@example.test"
        signOutAction={<button type="submit">Sign out</button>}
        api={api()}
      />,
    );

    expect(await screen.findByText("Home")).toBeTruthy();
    expect(screen.getByText("ABCDEFGHIJ")).toBeTruthy();
    expect(screen.getByText("member@example.test")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Products" }).getAttribute("href")).toBe(
      "/settings/products",
    );
    expect(screen.getByRole("link", { name: "Categories" }).getAttribute("href")).toBe(
      "/settings/categories",
    );
    expect(screen.getByRole("link", { name: "Locations" }).getAttribute("href")).toBe(
      "/settings/locations",
    );
  });

  it("copies the join code and shows Copied.", async () => {
    const settings = api();
    render(
      <HouseholdSettingsScreen
        householdId={HOUSEHOLD.id}
        email="member@example.test"
        signOutAction={<button type="submit">Sign out</button>}
        api={settings}
      />,
    );
    await screen.findByText("ABCDEFGHIJ");

    fireEvent.click(screen.getByRole("button", { name: "Copy join code" }));
    await waitFor(() => {
      expect(settings.copyText).toHaveBeenCalledWith("ABCDEFGHIJ");
    });
    expect(screen.getByRole("status").textContent).toBe("Copied.");
  });

  it("shows copy failure when the clipboard rejects", async () => {
    const settings = api({
      copyText: vi.fn().mockRejectedValue(new Error("denied")),
    });
    render(
      <HouseholdSettingsScreen
        householdId={HOUSEHOLD.id}
        email="member@example.test"
        signOutAction={<button type="submit">Sign out</button>}
        api={settings}
      />,
    );
    await screen.findByText("ABCDEFGHIJ");

    fireEvent.click(screen.getByRole("button", { name: "Copy join code" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not copy. Try again.");
  });

  it("renames and shows Saved.", async () => {
    const settings = api({
      getLocalHousehold: vi
        .fn()
        .mockResolvedValueOnce(HOUSEHOLD)
        .mockResolvedValue({ ...HOUSEHOLD, name: "New Home" }),
    });
    render(
      <HouseholdSettingsScreen
        householdId={HOUSEHOLD.id}
        email="member@example.test"
        signOutAction={<button type="submit">Sign out</button>}
        api={settings}
      />,
    );
    await screen.findByText("Home");

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Household name"), {
      target: { value: "New Home" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

    await waitFor(() => {
      expect(settings.renameHousehold).toHaveBeenCalledWith({
        householdId: HOUSEHOLD.id,
        name: "New Home",
      });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Saved.");
    expect(await screen.findByText("New Home")).toBeTruthy();
  });

  it("keeps the rename dialog open on invalid_name", async () => {
    const settings = api({
      renameHousehold: vi.fn().mockResolvedValue({ ok: false, code: "invalid_name" }),
    });
    render(
      <HouseholdSettingsScreen
        householdId={HOUSEHOLD.id}
        email="member@example.test"
        signOutAction={<button type="submit">Sign out</button>}
        api={settings}
      />,
    );
    await screen.findByText("Home");

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Household name"), { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Enter a household name (1–80 characters).",
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
