import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { defineConfig } from "@playwright/test";

const localBrowserLibraries = join(
  homedir(),
  ".cache",
  "playwright-system-libs",
  "usr",
  "lib",
  "x86_64-linux-gnu",
);
if (existsSync(localBrowserLibraries)) {
  process.env.LD_LIBRARY_PATH = [
    localBrowserLibraries,
    process.env.LD_LIBRARY_PATH,
  ]
    .filter((value): value is string => Boolean(value))
    .join(delimiter);
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  outputDir: "./test-results",
  use: {
    baseURL: "http://127.0.0.1:3101",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1365, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run build && npm run start -- --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101/chat",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
