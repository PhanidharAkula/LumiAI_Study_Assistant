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
  // Expose Supabase URL + anon key to the dev /api/chat so it can verify the
  // caller's session (in production Vercel provides these to the function).
  if (env.VITE_SUPABASE_URL) process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
  if (env.VITE_SUPABASE_ANON_KEY)
    process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

  return {
    plugins: [react(), tailwindcss(), devApiPlugin()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    base: "/",
    // Strip debug logging from production builds (kept in dev). console.error
    // and console.warn are preserved for real error reporting in production.
    esbuild: { pure: ["console.log", "console.debug", "console.info"] },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      rollupOptions: {
        output: {
          // Peel the heavy, self-contained vendor libraries out of the route
          // chunks: the chat view pulls in highlight.js + KaTeX + the markdown
          // pipeline, and the welcome page pulls in Lottie. Splitting them into
          // their own chunks lets them download in parallel and stay cached
          // across app deploys instead of bloating a single feature chunk.
          // Anything unmatched keeps Vite's default React.lazy() chunking.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("/highlight.js/")) return "vendor-highlight";
            if (id.includes("/katex/")) return "vendor-katex";
            if (id.includes("/pdfjs-dist/")) return "vendor-pdf";
            if (
              /[/\\]node_modules[/\\](react-markdown|remark|rehype|micromark|mdast|hast|unist|unified|vfile|property-information|character-entities|decode-named-character-reference|comma-separated-tokens|space-separated-tokens|html-void-elements|web-namespaces|zwitch|longest-streak|markdown-table|trim-lines|trough|bail|devlop|estree-util|hastscript|parse-entities|stringify-entities|ccount|escape-string-regexp|is-plain-obj|character-reference)/.test(
                id
              )
            )
              return "vendor-markdown";
            if (
              id.includes("/framer-motion/") ||
              id.includes("/motion-dom/") ||
              id.includes("/motion-utils/")
            )
              return "vendor-motion";
            if (id.includes("/lottie-web/") || id.includes("/lottie-react/"))
              return "vendor-lottie";
          },
        },
      },
    },
    server: { port: 5173, host: true },
  };
});
