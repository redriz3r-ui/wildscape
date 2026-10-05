import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/workspace",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    channel: "chrome",
    viewport: { width: 1440, height: 960 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "../.venv/bin/python ../server/browser_server.py",
      url: "http://127.0.0.1:8001/api/health/",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev",
      env: {
        WILDSCAPE_WEB_PORT: "5174",
        WILDSCAPE_API_URL: "http://127.0.0.1:8001",
      },
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
