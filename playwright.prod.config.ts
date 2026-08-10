import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

const { webServer: _developmentServer, ...shared } = base;
const port = Number(process.env.LWC_E2E_PORT ?? 4174);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig(shared, {
  use: { baseURL },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
