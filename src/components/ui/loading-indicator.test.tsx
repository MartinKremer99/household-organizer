/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadingIndicator } from "./loading-indicator";

afterEach(() => {
  cleanup();
});

describe("LoadingIndicator", () => {
  it("exposes one status with the given label", () => {
    render(<LoadingIndicator label="Loading household…" />);
    expect(screen.getByRole("status").textContent).toBe("Loading household…");
  });
});
