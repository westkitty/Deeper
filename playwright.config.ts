import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "fs";

// Chromium resolution: tools/ensure-chromium.mjs (run by `npm run test:e2e`)
// records an npm-delivered binary for environments where the playwright CDN is
// unreachable. Otherwise Playwright manages its own browser download.
let executablePath: string | undefined;
let libDir: string | undefined;
try {
  if (existsSync(".chromium-path.json")) {
    const parsed = JSON.parse(readFileSync(".chromium-path.json", "utf8")) as { executablePath?: string; libDir?: string };
    executablePath = parsed.executablePath;
    libDir = parsed.libDir;
  }
} catch {
  // fall through to playwright default
}
const launchEnv = libDir && existsSync(libDir) ? { ...process.env, LD_LIBRARY_PATH: `${libDir}/lib:${process.env.LD_LIBRARY_PATH ?? ""}` } : process.env;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173/Deeper/",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath, env: launchEnv, args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] } : {},
  },
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173/Deeper/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } }],
});
