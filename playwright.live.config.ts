import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

const { webServer: _developmentServer, ...shared } = base;
const port = Number(process.env.LWC_LIVE_E2E_PORT ?? 4175);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig(shared, {
  testMatch: "live-workbench.spec.ts",
  use: { ...shared.use, baseURL },
  webServer: {
    command: "pnpm build && node scripts/live-e2e-server.mjs",
    url: `${baseURL}/__lwc/status`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
