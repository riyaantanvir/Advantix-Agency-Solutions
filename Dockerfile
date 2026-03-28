# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build everything
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace manifests first (for layer caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json tsconfig.json ./

# Copy all source packages
COPY lib/     ./lib/
COPY artifacts/advantix-website/ ./artifacts/advantix-website/
COPY artifacts/advantix-admin/   ./artifacts/advantix-admin/
COPY artifacts/api-server/       ./artifacts/api-server/

# Install all dependencies (dev + prod)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build public website  (BASE_PATH=/ is the default in vite.config.ts)
RUN pnpm --filter @workspace/advantix-website run build

# Build admin dashboard (BASE_PATH=/admin/ is the default in vite.config.ts)
RUN BASE_PATH=/admin/ pnpm --filter @workspace/advantix-admin run build

# Build & bundle the API server with esbuild
RUN pnpm --filter @workspace/api-server run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production image (slim)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Workspace manifests needed for pnpm --prod install
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json tsconfig.json ./

# Lib packages (workspace dependencies of api-server)
COPY --from=builder /app/lib/ ./lib/

# API server source/manifest for prod dep resolution
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

# Install ONLY production dependencies (no devDependencies)
RUN pnpm install --filter @workspace/api-server... --prod --frozen-lockfile --ignore-scripts

# Copy built API server bundle
COPY --from=builder /app/artifacts/api-server/dist/ ./artifacts/api-server/dist/

# Copy built static frontend files
COPY --from=builder /app/artifacts/advantix-website/dist/public/ ./artifacts/advantix-website/dist/public/
COPY --from=builder /app/artifacts/advantix-admin/dist/public/   ./artifacts/advantix-admin/dist/public/

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# On startup: migrations run automatically inside the server (seed.ts)
CMD ["node", "--enable-source-maps", "/app/artifacts/api-server/dist/index.mjs"]
