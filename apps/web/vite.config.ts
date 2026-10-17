import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the app runs here and the API on :3000. The server's
// BETTER_AUTH_URL points at this origin (apps/server/.env.example), so sign-in
// origins and emailed links match.
const toApi = "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": toApi,
      "/health": toApi,
    },
  },
  build: {
    outDir: "dist",
  },
});
