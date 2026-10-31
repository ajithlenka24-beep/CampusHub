import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the API runs on :4000; Vite proxies /api and /uploads so the
// browser sees ONE origin (cookies stay first-party and SameSite=Lax works).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/uploads": "http://localhost:4000",
    },
  },
  preview: { port: 5173 },
});
