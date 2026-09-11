import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("service worker source", () => {
  const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

  it("does not precache HTML or install slash", () => {
    expect(source).not.toMatch(/cache\.add\s*\(\s*["']\/["']/);
    expect(source).not.toMatch(/cache\.addAll/);
  });

  it("bypasses Supabase and auth APIs", () => {
    expect(source).toMatch(/supabase/);
    expect(source).toMatch(/auth\/v1/);
    expect(source).toMatch(/rest\/v1/);
  });

  it("is excluded from the auth proxy matcher", () => {
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxy).toContain(String.raw`sw\\.js`);
    expect(proxy).toContain(String.raw`manifest\\.webmanifest`);
  });

  it("does not cache document navigations", () => {
    expect(source).toContain("household-shell-v2");
    const start = source.indexOf("async function networkFirstNavigate");
    const end = source.indexOf("self.addEventListener(\"install\"");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(source.slice(start, end)).not.toMatch(/cache\.put/);
  });

  it("does not register background sync, push, or timers", () => {
    expect(source).not.toMatch(/periodicsync/);
    expect(source).not.toMatch(/addEventListener\(\s*["']push["']/);
    expect(source).not.toMatch(/setInterval/);
    expect(source).not.toMatch(/syncHousehold/);
  });
});
