import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 本地开发和生产环境均使用 "/"（独立域名 aitestlink.cn，无子路径）
// 通过 VITE_BASE 环境变量可覆盖
function getBase(mode: string, viteBase?: string): string {
  if (mode === "development") return "/";
  return viteBase || "/";
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiPort = env.API_PORT || "8001";
  return ({
  base: getBase(mode, env.VITE_BASE),
  plugins: [react(), tailwindcss()],
  server: {
    host: "::",
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      "/uploads": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  });
});
