import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

const { webServer: _developmentServer, ...shared } = base;

export default defineConfig(shared, {
  use: { baseURL: "http://127.0.0.1:4174" },
  webServer: {
    command: "pnpm preview",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
  },
});
