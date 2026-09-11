import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { updateSession } from "./proxy";

const URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const PUB_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

const previous = {
  url: process.env[URL_KEY],
  key: process.env[PUB_KEY],
};

afterEach(() => {
  if (previous.url === undefined) {
    delete process.env[URL_KEY];
  } else {
    process.env[URL_KEY] = previous.url;
  }
  if (previous.key === undefined) {
    delete process.env[PUB_KEY];
  } else {
    process.env[PUB_KEY] = previous.key;
  }
});

describe("updateSession", () => {
  it("redirects household routes to login when Supabase env is missing", async () => {
    delete process.env[URL_KEY];
    delete process.env[PUB_KEY];

    const response = await updateSession(new NextRequest("http://localhost:3001/inventory"));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("leaves login reachable when Supabase env is missing", async () => {
    delete process.env[URL_KEY];
    delete process.env[PUB_KEY];

    const response = await updateSession(new NextRequest("http://localhost:3001/login"));
    expect(response.status).toBe(200);
  });
});
