/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "./select";

afterEach(() => {
  cleanup();
});

describe("Select", () => {
  it("uses native select semantics with a visible label", () => {
    const onChange = vi.fn();
    render(
      <Select id="category" label="Category" value="food" onChange={onChange}>
        <option value="food">Food</option>
        <option value="drinks">Drinks</option>
      </Select>,
    );

    const select = screen.getByLabelText("Category");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveProperty("value", "food");
    expect(select.className).toContain("min-h-11");

    fireEvent.change(select, { target: { value: "drinks" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("forwards disabled and required", () => {
    render(
      <Select id="location" label="Location" disabled required>
        <option value="kitchen">Kitchen</option>
      </Select>,
    );

    const select = screen.getByLabelText("Location");
    expect(select).toHaveProperty("disabled", true);
    expect(select).toHaveProperty("required", true);
  });
});
