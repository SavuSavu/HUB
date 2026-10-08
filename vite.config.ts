import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { validAccessConfig } from "./src/access";
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (
    command === "build" &&
    !validAccessConfig(env.VITE_ACCESS_HASH ?? "", env.VITE_ACCESS_SALT ?? "")
  )
    throw new Error(
      "HUB access is not configured. Run npm run access:configure or set VITE_ACCESS_HASH and VITE_ACCESS_SALT.",
    );
  return {
    base: process.env.BASE_PATH || "/HUB/",
    plugins: [react(), tailwind()],
    build: { chunkSizeWarningLimit: 700 },
  };
});
