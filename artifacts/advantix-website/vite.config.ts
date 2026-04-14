import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/* ── OG meta-tag injection for dev server ───────────────────────────────────
   Social-media bots (Facebook, Twitter, Telegram, LinkedIn…) don't run JS.
   When they crawl /blog/:slug on the Vite dev server they see the bare
   index.html with generic fallback meta tags.  This plugin intercepts those
   requests, fetches the post data from the API, and rewrites the meta tags in
   the HTML that Vite would otherwise serve — giving crawlers the real
   og:title, og:description and og:image for each post.
─────────────────────────────────────────────────────────────────────────── */
function ogInjectorPlugin(): Plugin {
  return {
    name: "og-injector",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawPath = (req.url ?? "").split("?")[0];
        const match   = rawPath.match(/^\/blog\/([^/]+)$/);
        if (!match) { next(); return; }

        try {
          const slug    = match[1];
          const apiBase = `http://localhost:${process.env.API_PORT ?? 8080}`;
          const apiRes  = await fetch(`${apiBase}/api/blog/${slug}`);
          if (!apiRes.ok) { next(); return; }

          const post: {
            title: string;
            excerpt?: string | null;
            coverImageUrl?: string | null;
            seoTitle?: string | null;
            seoDescription?: string | null;
            slug: string;
          } = await apiRes.json();

          const SITE_ORIGIN = process.env.SITE_URL ?? "https://advantix.digital";
          const rawCover    = post.coverImageUrl ?? "";
          const image       = rawCover
            ? rawCover.startsWith("http")
              ? rawCover
              : `${SITE_ORIGIN}${rawCover.startsWith("/") ? "" : "/"}${rawCover}`
            : `${SITE_ORIGIN}/images/og-image.png`;
          const title       = `${post.seoTitle ?? post.title} | Advantix Digital`;
          const description = post.seoDescription ?? post.excerpt ?? `Read "${post.title}" on the Advantix Digital blog.`;
          const url         = `${SITE_ORIGIN}/blog/${post.slug}`;

          const esc = (s: string) =>
            s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

          // Read and let Vite transform the index.html (HMR scripts, etc.)
          const raw       = fs.readFileSync(path.resolve(import.meta.dirname, "index.html"), "utf-8");
          let   html      = await server.transformIndexHtml(req.url ?? "/", raw);

          html = html
            .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
            .replace(/(name="description"[^>]*content=")[^"]*(")/i,           `$1${esc(description)}$2`)
            .replace(/(rel="canonical"[^>]*href=")[^"]*(")/i,                 `$1${esc(url)}$2`)
            .replace(/(property="og:type"[^>]*content=")[^"]*(")/i,          `$1article$2`)
            .replace(/(property="og:title"[^>]*content=")[^"]*(")/i,         `$1${esc(title)}$2`)
            .replace(/(property="og:description"[^>]*content=")[^"]*(")/i,   `$1${esc(description)}$2`)
            .replace(/(property="og:image"[^>]*content=")[^"]*(")/i,         `$1${esc(image)}$2`)
            .replace(/(property="og:image:width"[^>]*content=")[^"]*(")/i,   `$11200$2`)
            .replace(/(property="og:image:height"[^>]*content=")[^"]*(")/i,  `$1630$2`)
            .replace(/(property="og:url"[^>]*content=")[^"]*(")/i,           `$1${esc(url)}$2`)
            .replace(/(name="twitter:title"[^>]*content=")[^"]*(")/i,        `$1${esc(title)}$2`)
            .replace(/(name="twitter:description"[^>]*content=")[^"]*(")/i,  `$1${esc(description)}$2`)
            .replace(/(name="twitter:image"[^>]*content=")[^"]*(")/i,        `$1${esc(image)}$2`);

          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-store"); // dev: never cache
          res.end(html);
        } catch {
          next();
        }
      });
    },
  };
}

const port = Number(process.env.PORT ?? "3000");
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ogInjectorPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "SOURCEMAP_ERROR") return;
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        warn(warning);
      },
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-motion": ["framer-motion"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-tooltip"],
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/r/": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
