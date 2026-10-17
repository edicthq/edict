import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

const api = "http://localhost:3000";

// In development the app runs on Vite and the API on :3000. Production serves
// both from one origin, so the proxy makes requests look same-origin too:
// Better Auth rejects sign-ins from an origin it doesn't know.
const toApi: ProxyOptions = {
  target: api,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on("proxyReq", (request) => {
      if (request.getHeader("origin")) request.setHeader("origin", api);
    });
  },
};

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
