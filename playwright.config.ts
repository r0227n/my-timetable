import { defineConfig, devices } from "@playwright/test";

const analysisMode = process.env.E2E_ANALYSIS_MODE === "fake" || process.env.CI ? "fake" : "real";
const analysisPort = 4174;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: analysisMode === "real" ? 15 * 60_000 : 30_000,
  use: {
    baseURL: `http://127.0.0.1:${analysisPort}/my-timetable/`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    locale: "ja-JP",
    launchOptions: {
      args: ["--enable-unsafe-webgpu"],
    },
  },
  projects: [
    {
      name: "pages-smoke",
      testMatch: /pages\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:4173/my-timetable/" },
    },
    {
      name: `analysis-${analysisMode}`,
      testMatch: /analysis\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: "bun run preview -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173/my-timetable/",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `bun run preview -- --mode e2e-${analysisMode} --host 127.0.0.1 --port ${analysisPort}`,
      url: `http://127.0.0.1:${analysisPort}/my-timetable/`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
