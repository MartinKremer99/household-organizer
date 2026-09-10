import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root = process.cwd();
const port = 3456;
const origin = `http://localhost:${port}`;

export default defineConfig({
  testDir: path.join(root, "e2e/specs"),
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: path.join(root, "test-results"),
  use: {
    baseURL: origin,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `NEXT_DIST_DIR=.next-e2e pnpm exec next dev --port ${port}`,
    cwd: root,
    url: `${origin}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
