/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TextField } from "./text-field";

afterEach(() => {
  cleanup();
});

describe("TextField", () => {
  it("associates a visible label with the input", () => {
    render(<TextField id="email" name="email" label="Email" />);
    const input = screen.getByLabelText("Email");

    expect(input).toHaveProperty("id", "email");
    expect(input).toHaveProperty("name", "email");
    expect(input.className).toContain("min-h-11");
    expect(input.className).toContain("bg-surface");
    expect(input.className).toContain("placeholder:text-muted-foreground");
  });

  it("forwards disabled to the control", () => {
    render(<TextField id="name" label="Name" disabled />);
    expect(screen.getByLabelText("Name")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Name").className).toContain("disabled:bg-muted");
  });
});
