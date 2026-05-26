import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Dev-only plugin: serve the /api/chat serverless function through Vite's dev
// server so AI works locally without `vercel dev`. The Anthropic API key stays
// server-side (it lives in process.env, never in the client bundle).
function devApiPlugin() {
  return {
    name: "lumi-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/chat")) return next();
        try {
          const mod = await server.ssrLoadModule("/api/chat.ts");
          await mod.default(req, res);
        } catch (err) {
          server.config.logger.error(
            "[dev-api] " + (err?.stack || String(err))
          );
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({ error: "Dev API error: " + (err?.message || err) })
            );
          }
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load non-VITE_ env (e.g. ANTHROPIC_API_KEY) so the dev API can read it.
  const env = loadEnv(mode, process.cwd(), "");
  if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  if (env.ANTHROPIC_MODEL) process.env.ANTHROPIC_MODEL = env.ANTHROPIC_MODEL;

  return {
    plugins: [react(), tailwindcss(), devApiPlugin()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    base: "/",
    build: {
      outDir: "dist",
      assetsDir: "assets",
      // Chunking is handled automatically by Vite + the React.lazy() route/
      // overlay boundaries — no manual vendor splitting needed.
    },
    server: { port: 5173, host: true },
  };
});
