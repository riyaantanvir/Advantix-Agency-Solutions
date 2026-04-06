# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build everything
# Using node:22-slim (Debian/GNU) — NOT alpine — because our pnpm lockfile
# uses @rollup/rollup-linux-x64-gnu (GNU binary), which is incompatible with
# Alpine's MUSL libc. Switching to slim keeps the image small while matching
# the correct native binary platform.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace manifests first (for layer caching)
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json tsconfig.json ./

# Copy all source packages
COPY lib/                        ./lib/
COPY artifacts/advantix-website/ ./artifacts/advantix-website/
COPY artifacts/advantix-admin/   ./artifacts/advantix-admin/
COPY artifacts/advantix-ai/      ./artifacts/advantix-ai/
COPY artifacts/api-server/       ./artifacts/api-server/

# Install all dependencies (dev + prod + optional native binaries)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build public website
RUN pnpm --filter @workspace/advantix-website run build

# Build admin dashboard
RUN BASE_PATH=/admin/ pnpm --filter @workspace/advantix-admin run build

# Build AI tool
RUN BASE_PATH=/ai/ pnpm --filter @workspace/advantix-ai run build

# Build & bundle the API server with esbuild
RUN pnpm --filter @workspace/api-server run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production image (slim)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Workspace manifests needed for pnpm --prod install
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json tsconfig.json ./

# Lib packages (workspace dependencies of api-server)
COPY --from=builder /app/lib/ ./lib/

# API server source/manifest for prod dep resolution
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

# Install ONLY production dependencies
RUN pnpm install --filter @workspace/api-server... --prod --frozen-lockfile --ignore-scripts

# Copy built API server bundle
COPY --from=builder /app/artifacts/api-server/dist/ ./artifacts/api-server/dist/

# Copy built static frontend files
COPY --from=builder /app/artifacts/advantix-website/dist/public/ ./artifacts/advantix-website/dist/public/
COPY --from=builder /app/artifacts/advantix-admin/dist/public/   ./artifacts/advantix-admin/dist/public/
COPY --from=builder /app/artifacts/advantix-ai/dist/public/      ./artifacts/advantix-ai/dist/public/

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Migrations + seed run automatically on server start (see seed.ts)
CMD ["node", "--enable-source-maps", "/app/artifacts/api-server/dist/index.mjs"]
