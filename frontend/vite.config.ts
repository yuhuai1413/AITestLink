import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// dev: base = "/"  (本地开发，无子路径)
// prod build: base = "/aitestlink/"  (服务器子路径部署)
// 通过 VITE_BASE 环境变量覆盖，或自动判断
function getBase(mode: string, viteBase?: string): string {
  if (mode === "development") return "/";
  return viteBase || "/aitestlink/";
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
