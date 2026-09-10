import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

vi.mock("@/app/globals.css", () => ({}));

describe("web app manifest", () => {
  beforeAll(() => {
    vi.resetModules();
  });

  it("describes Household Organizer as a standalone app", async () => {
    const { default: manifest } = await import("@/app/manifest");
    const data = manifest();

    expect(data.name).toBe("Household Organizer");
    expect(data.short_name).toBe("Household");
    expect(data.start_url).toBe("/");
    expect(data.display).toBe("standalone");
    expect(data).not.toHaveProperty("permissions");
    expect(data.icons).toEqual([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ]);
  });

  it("exports a mobile viewport", async () => {
    const { viewport } = await import("@/app/layout");
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
  });
});
