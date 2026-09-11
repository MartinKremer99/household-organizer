/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card } from "./card";

afterEach(() => {
  cleanup();
});

describe("Card", () => {
  it("renders the title as an h2 by default", () => {
    render(<Card title="Low stock">Nothing yet.</Card>);

    expect(screen.getByRole("heading", { level: 2, name: "Low stock" })).toBeTruthy();
    expect(screen.getByText("Nothing yet.")).toBeTruthy();
  });

  it("can render a non-heading title", () => {
    render(
      <Card title="Milk" titleAs="p">
        2 in stock
      </Card>,
    );

    expect(screen.queryByRole("heading", { name: "Milk" })).toBeNull();
    expect(screen.getByText("Milk").tagName).toBe("P");
  });
});
