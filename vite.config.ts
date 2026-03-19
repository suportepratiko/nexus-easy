import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const easypanelHosts = (process.env.EASYPANEL_HOST ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const serverConfig = {
  host: "::",
  port: 8000,
  allowedHosts: [
    "nexusbot.pratiko.app.br",
    "localhost",
    "127.0.0.1",
    ...easypanelHosts,
  ].filter(Boolean),
  hmr: {
    overlay: false,
  },
  // Proxy: em dev, /api e /health vão para o backend (porta 8001). Uma única URL: abra http://localhost:8000
  proxy: {
    "/api": {
      target: "http://127.0.0.1:8001",
      changeOrigin: true,
      secure: false,
      ws: true,
      configure: (proxy) => {
        proxy.on("proxyReq", (proxyReq, req) => {
          const auth = req.headers.authorization || req.headers.Authorization;
          if (auth) proxyReq.setHeader("Authorization", auth);
        });
      },
    },
    "/ws": {
      target: "ws://127.0.0.1:8001",
      ws: true,
      changeOrigin: true,
    },
    "/health": { target: "http://127.0.0.1:8001", changeOrigin: true, secure: false },
  },
} as any;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: serverConfig,
  preview: serverConfig,
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
