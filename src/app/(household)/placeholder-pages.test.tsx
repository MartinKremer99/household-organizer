import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import InventoryPage from "./inventory/page";
import ShoppingPage from "./shopping/page";

describe("placeholder pages", () => {
  it("renders the inventory empty state", () => {
    const html = renderToStaticMarkup(<InventoryPage />);
    expect(html).toContain(">Inventory<");
    expect(html).toContain("No products yet.");
  });

  it("renders the shopping empty state", () => {
    const html = renderToStaticMarkup(<ShoppingPage />);
    expect(html).toContain(">Shopping<");
    expect(html).toContain("Nothing to buy.");
  });
});
