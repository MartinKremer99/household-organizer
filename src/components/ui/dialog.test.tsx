/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";

afterEach(() => {
  cleanup();
});

function DialogHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        title="Add product"
        titleId="add-product-title"
        onClose={() => setOpen(false)}
      >
        <input id="dialog-name" aria-label="Name" />
        <button type="button">Save</button>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("does not render when closed", () => {
    render(
      <Dialog open={false} title="Add product" titleId="add-product-title" onClose={vi.fn()}>
        Body
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exposes dialog semantics and does not close on backdrop click", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog open title="Add product" titleId="add-product-title" onClose={onClose}>
        Body
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Add product" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("overscroll-contain");

    fireEvent.click(container.firstChild as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Add product" titleId="add-product-title" onClose={onClose}>
        Body
      </Dialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the panel on open and restores the trigger on close", () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Add product" });
    expect(document.activeElement).toBe(dialog);
    expect(document.activeElement).not.toBe(screen.getByLabelText("Name"));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Tab inside the dialog", () => {
    render(
      <Dialog open title="Add product" titleId="add-product-title" onClose={vi.fn()}>
        <input id="dialog-name" aria-label="Name" />
        <button type="button">Save</button>
      </Dialog>,
    );

    const name = screen.getByLabelText("Name");
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(name);

    name.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
  });
});
