import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

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
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // injectManifest: usa src/sw.js como base (tem push handler) e injeta o precache manifest
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "prompt",
      injectRegister: null,
      injectManifest: {
        // Arquivos a pré-cachear
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      manifest: false, // Usa o manifest.json existente em /public
      // devOptions: serve o SW também em modo dev (npm start / vite dev)
      // Sem isso, o sw.js não existe em dev e o push nunca registra
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
