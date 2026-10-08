import { pbkdf2Sync } from "node:crypto";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL: "http://localhost:4173/HUB/",
    headless: true,
    launchOptions: { args: ["--no-sandbox"] },
  },
  webServer: {
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173",
    url: "http://localhost:4173/HUB/",
    reuseExistingServer: false,
    env: {
      VITE_ACCESS_SALT: "0123456789abcdef0123456789abcdef",
      VITE_ACCESS_HASH: pbkdf2Sync(
        "browser-test-access",
        "0123456789abcdef0123456789abcdef",
        210000,
        32,
        "sha256",
      ).toString("hex"),
    },
  },
  reporter: "list",
});
