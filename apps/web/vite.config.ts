import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the app runs here and the API on :3000 (override with
// EDICT_API_TARGET, when something else already uses that port). The server's
// BETTER_AUTH_URL points at this origin (apps/server/.env.example), so sign-in
// origins and emailed links match.
const toApi = process.env.EDICT_API_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": toApi,
      // Attachment bytes (ADR 0020), fetched during image preview.
      "/files": toApi,
      "/health": toApi,
      // Realtime events over the socket.
      "/ws": { target: toApi, ws: true },
      // MCP clients and their OAuth discovery (ADR 0021).
      "/mcp": toApi,
      "/.well-known": toApi,
    },
  },
  build: {
    outDir: "dist",
  },
});
