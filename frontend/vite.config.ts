import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_PORT = process.env.API_PORT || "8000";

// dev: base = "/"  (本地开发，无子路径)
// prod build: base = "/aitestlink/"  (服务器子路径部署)
// 通过 VITE_BASE 环境变量覆盖，或自动判断
function getBase(mode: string): string {
  if (mode === "development") return "/";
  return process.env.VITE_BASE || "/aitestlink/";
}

export default defineConfig(({ mode }) => ({
  base: getBase(mode),
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
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
      "/uploads": {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
}));
