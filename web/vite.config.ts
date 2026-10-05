import { defineConfig } from "vitest/config";
export default defineConfig({
  publicDir: "../public",
  server: {
    port: Number(process.env.WILDSCAPE_WEB_PORT || 5173),
    strictPort: true,
    proxy: { "/api": process.env.WILDSCAPE_API_URL || "http://127.0.0.1:8000" },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 1600 },
  test: { include: ["tests/**/*.test.ts"] },
});
