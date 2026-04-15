# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build everything
# Using node:22-slim (Debian/GNU) — NOT alpine — because our pnpm lockfile
# uses @rollup/rollup-linux-x64-gnu (GNU binary), which is incompatible with
# Alpine's MUSL libc. Using slim keeps the image small while matching the
# correct native binary platform.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace manifests first (for layer caching — changes here invalidate
# the install layer but not the source-copy layers above)
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json tsconfig.json ./

# Copy all source packages
COPY lib/                        ./lib/
COPY artifacts/advantix-website/ ./artifacts/advantix-website/
COPY artifacts/advantix-admin/   ./artifacts/advantix-admin/
COPY artifacts/advantix-ai/      ./artifacts/advantix-ai/
COPY artifacts/api-server/       ./artifacts/api-server/

# Install ALL dependencies (dev + prod + optional native binaries for the build)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build public website (BASE_PATH defaults to "/" in vite.config.ts)
RUN pnpm --filter @workspace/advantix-website run build

# Build admin dashboard at /admin/
RUN BASE_PATH=/admin/ pnpm --filter @workspace/advantix-admin run build

# Build AI tool at /ai/
RUN BASE_PATH=/ai/ pnpm --filter @workspace/advantix-ai run build

# Bundle the API server with esbuild into a single self-contained file
RUN pnpm --filter @workspace/api-server run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production image (slim — no build tools, no dev deps, no src)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Workspace manifests + lockfile needed for production-only dep install
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json tsconfig.json ./

# Lib source packages — required so pnpm can resolve workspace:* references
# when installing the api-server's production dependencies below
COPY --from=builder /app/lib/ ./lib/

# api-server package.json — needed so pnpm knows which packages to install
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

# Install ONLY production dependencies for the api-server and its workspace
# dependencies (the --filter "..." syntax installs the package + dependencies)
RUN pnpm install --filter @workspace/api-server... --prod --frozen-lockfile --ignore-scripts

# ── Built artefacts ──────────────────────────────────────────────────────────

# API server esbuild bundle (includes all workspace lib packages)
COPY --from=builder /app/artifacts/api-server/dist/ ./artifacts/api-server/dist/

# Tesseract OCR training data (needed by tesseract.js at runtime for PDF OCR)
COPY --from=builder /app/artifacts/api-server/ben.traineddata ./artifacts/api-server/ben.traineddata

# Built static frontends served by Express in production
COPY --from=builder /app/artifacts/advantix-website/dist/public/ ./artifacts/advantix-website/dist/public/
COPY --from=builder /app/artifacts/advantix-admin/dist/public/   ./artifacts/advantix-admin/dist/public/
COPY --from=builder /app/artifacts/advantix-ai/dist/public/      ./artifacts/advantix-ai/dist/public/

# Persistent uploads directory (blog images, etc.)
# Mounted as a volume on DigitalOcean so uploads survive deployments:
#   docker run -v advantix_uploads:/app/uploads ...
RUN mkdir -p /app/uploads

# ── Environment ───────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# On startup the server automatically:
#   1. Ensures the session table exists
#   2. Runs all CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS migrations
#   3. Seeds the admin account (syncing ADMIN_PASSWORD from env)
#   4. Seeds default services and Telegram notification defaults
CMD ["node", "--enable-source-maps", "/app/artifacts/api-server/dist/index.mjs"]
