import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 20_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4173/api/status",
    reuseExistingServer: true,
    timeout: 20_000,
    env: {
      OPENCODE_BIN: "/definitely/not/opencode",
      OPENCODE_URL: "http://127.0.0.1:59999",
    },
  },
  reporter: [["list"]],
});
