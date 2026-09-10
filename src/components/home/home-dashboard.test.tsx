import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeDashboard } from "./home-dashboard";

describe("HomeDashboard", () => {
  it("shows a disabled add action and locked empty states", () => {
    const html = renderToStaticMarkup(<HomeDashboard />);

    expect(html).toContain("Home");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add item<\/button>/);
    expect(html).toContain("Adding items is not available yet.");
    expect(html).toContain("Nothing is low.");
    expect(html).toContain("Nothing is expiring soon.");
    expect(html).toContain("Nothing waiting to be stored.");
    expect(html).toContain("No locations yet.");
    expect(html).toContain("No active shopping list.");

    const bodies = [...html.matchAll(/<h2[^>]*>[^<]+<\/h2>\s*<div[^>]*>([\s\S]*?)<\/div>/g)];
    expect(bodies).toHaveLength(5);
    for (const [, body] of bodies) {
      expect(body.replace(/<[^>]+>/g, "")).not.toMatch(/\d+/);
    }
  });
});
