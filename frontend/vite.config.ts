import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_PORT = process.env.API_PORT || "8000";

export default defineConfig({
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
});
