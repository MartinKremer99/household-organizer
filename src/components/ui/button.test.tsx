/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";

afterEach(() => {
  cleanup();
});

describe("Button", () => {
  it("defaults to type=button and the primary variant", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });

    expect(button).toHaveProperty("type", "button");
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("touch-manipulation");
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("text-primary-foreground");
    expect(button.className).toContain("focus-visible:outline-primary");
  });

  it("renders secondary and danger without underline", () => {
    const { rerender } = render(<Button variant="secondary">Cancel</Button>);
    expect(screen.getByRole("button").className).toContain("bg-surface");
    expect(screen.getByRole("button").className).toContain("border-border");

    rerender(<Button variant="danger">Remove</Button>);
    const danger = screen.getByRole("button", { name: "Remove" });
    expect(danger.className).toContain("text-danger");
    expect(danger.className).toContain("border-danger");
    expect(danger.className).not.toContain("underline");
  });
});
