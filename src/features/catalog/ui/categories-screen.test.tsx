/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoriesScreen, type CategoriesScreenApi } from "./categories-screen";

const HOUSEHOLD = "household-a";
const food = {
  id: "cat-1",
  household_id: HOUSEHOLD,
  name: "Food",
  is_active: true,
  created_at: "2026-09-09T10:00:00.000Z",
  updated_at: "2026-09-09T10:00:00.000Z",
};

function api(overrides: Partial<CategoriesScreenApi> = {}): CategoriesScreenApi {
  return {
    listActiveCategories: vi.fn().mockResolvedValue([food]),
    createCategory: vi.fn().mockResolvedValue({ ok: true, value: food }),
    renameCategory: vi.fn().mockResolvedValue({ ok: true, value: food }),
    archiveCategory: vi.fn().mockResolvedValue({ ok: true, value: { ...food, is_active: false } }),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("CategoriesScreen", () => {
  it("renders categories and calls create, rename, and archive", async () => {
    const catalog = api();
    render(<CategoriesScreen householdId={HOUSEHOLD} api={catalog} />);
    expect(await screen.findByRole("heading", { name: "Food" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Drinks" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await waitFor(() => {
      expect(catalog.createCategory).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        name: "Drinks",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Rename Food" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Groceries" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await waitFor(() => {
      expect(catalog.renameCategory).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        category_id: "cat-1",
        name: "Groceries",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Archive Food" }));
    expect(catalog.archiveCategory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(catalog.archiveCategory).toHaveBeenCalledWith({
        household_id: HOUSEHOLD,
        category_id: "cat-1",
      });
    });
  });

  it("shows a clear message when archive is rejected", async () => {
    const catalog = api({
      archiveCategory: vi
        .fn()
        .mockResolvedValue({ ok: false, code: "category_in_use" }),
    });
    render(<CategoriesScreen householdId={HOUSEHOLD} api={catalog} />);
    await screen.findByRole("heading", { name: "Food" });

    fireEvent.click(screen.getByRole("button", { name: "Archive Food" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Reassign products in this category before archiving it.",
    );
  });
});
