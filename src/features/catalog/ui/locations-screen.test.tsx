/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationsScreen, type LocationsScreenApi } from "./locations-screen";

const HOUSEHOLD = "household-a";

function location(id: string, name: string, sort_order: number) {
  return {
    id,
    household_id: HOUSEHOLD,
    name,
    is_active: true,
    sort_order,
    created_at: "2026-09-09T10:00:00.000Z",
    updated_at: "2026-09-09T10:00:00.000Z",
  };
}

function api(overrides: Partial<LocationsScreenApi> = {}): LocationsScreenApi {
  return {
    listActiveLocations: vi
      .fn()
      .mockResolvedValue([
        location("loc-z", "Zebra", 1),
        location("loc-a", "Apple", 1),
      ]),
    createLocation: vi.fn().mockResolvedValue({
      ok: true,
      value: location("loc-new", "Cellar", 2),
    }),
    renameLocation: vi.fn().mockResolvedValue({
      ok: true,
      value: location("loc-z", "Zoo", 1),
    }),
    archiveLocation: vi.fn().mockResolvedValue({
      ok: true,
      value: { ...location("loc-z", "Zebra", 1), is_active: false },
    }),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("LocationsScreen", () => {
  it("renders locations in the order returned by the application", async () => {
    render(<LocationsScreen householdId={HOUSEHOLD} api={api()} />);
    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((node) => node.textContent)).toEqual(["Zebra", "Apple"]);
  });

  it("calls create, rename, and archive application functions", async () => {
    const catalog = api();
    render(<LocationsScreen householdId={HOUSEHOLD} api={catalog} />);
    await screen.findByRole("heading", { name: "Zebra" });

    fireEvent.click(screen.getByRole("button", { name: "Add location" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Cellar" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await waitFor(() => {
      expect(catalog.createLocation).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        name: "Cellar",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Rename Zebra" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Zoo" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await waitFor(() => {
      expect(catalog.renameLocation).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        location_id: "loc-z",
        name: "Zoo",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Archive Zebra" }));
    expect(catalog.archiveLocation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(catalog.archiveLocation).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        location_id: "loc-z",
      });
    });
  });
});
