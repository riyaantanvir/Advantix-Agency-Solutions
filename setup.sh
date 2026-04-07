#!/bin/bash
# ============================================================
# Advantix Digital — Deploy Script
# Run this after "git pull" on your Digital Ocean droplet
#
# First time:    bash setup.sh --init
# After pull:    bash setup.sh
# ============================================================

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
step()  { echo -e "${CYAN}[→]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

INIT_MODE=false
[ "$1" = "--init" ] && INIT_MODE=true

echo ""
echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN}   Advantix Digital — Deploy Script${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""

# ── 1. Check .env ─────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    warn ".env not found — creating from .env.example"
    cp .env.example .env
    echo ""
    echo -e "${RED}ACTION REQUIRED:${NC}"
    echo "  Edit .env with your real values:"
    echo "  nano .env"
    echo ""
    echo "  Required fields:"
    echo "    DATABASE_URL    — your PostgreSQL connection string"
    echo "    SESSION_SECRET  — run: openssl rand -hex 32"
    echo "    ADMIN_USERNAME  — admin login username"
    echo "    ADMIN_PASSWORD  — admin login password"
    echo ""
    exit 1
  else
    error ".env file missing. Copy .env.example and fill in your values."
  fi
fi

# Source env vars
set -a; source .env; set +a

[ -z "$DATABASE_URL" ]    && error "DATABASE_URL not set in .env"
[ -z "$SESSION_SECRET" ]  && error "SESSION_SECRET not set in .env"
[ "$SESSION_SECRET" = "change-this-to-a-long-random-string" ] && \
  error "SESSION_SECRET is still the default! Run: openssl rand -hex 32"

info ".env loaded"

# ── 2. System checks ──────────────────────────────────────────────────────────
command -v node &>/dev/null || error "Node.js not installed. Install Node.js 20+."
NODE_VER=$(node -v | cut -d'.' -f1 | tr -d 'v')
[ "$NODE_VER" -lt 20 ] && error "Node.js 20+ required. Got $(node -v)"
info "Node.js $(node -v)"

if ! command -v pnpm &>/dev/null; then
  step "Installing pnpm..."
  npm install -g pnpm
fi
info "pnpm $(pnpm -v)"

if ! command -v pm2 &>/dev/null; then
  step "Installing PM2..."
  npm install -g pm2
fi
info "PM2 $(pm2 -v)"

# ── 3. Install dependencies ───────────────────────────────────────────────────
step "Installing dependencies..."
pnpm install --frozen-lockfile
info "Dependencies installed"

# ── 4. Build all apps ─────────────────────────────────────────────────────────
step "Building API server..."
pnpm --filter @workspace/api-server run build
info "API server built"

step "Building website..."
pnpm --filter @workspace/advantix-website run build
info "Website built"

step "Building admin panel..."
pnpm --filter @workspace/advantix-admin run build
info "Admin panel built"

step "Building AI tool..."
pnpm --filter @workspace/advantix-ai run build
info "AI tool built"

# ── 5. Create logs directory ───────────────────────────────────────────────────
mkdir -p logs

# ── 6. Start / Restart with PM2 ───────────────────────────────────────────────
step "Starting server with PM2..."

if pm2 list | grep -q "advantix-api"; then
  pm2 reload ecosystem.config.cjs --update-env
  info "Server reloaded (zero-downtime)"
else
  pm2 start ecosystem.config.cjs
  info "Server started"
fi

# Save PM2 process list so it restarts on reboot
pm2 save
if $INIT_MODE; then
  pm2 startup | tail -1 | bash 2>/dev/null || \
    warn "Run 'pm2 startup' manually and follow its instructions to auto-start on reboot"
fi

# ── 7. Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo ""
echo "  Your server is running on PORT ${PORT:-8080}"
echo ""
echo "  Useful PM2 commands:"
echo -e "    ${YELLOW}pm2 logs advantix-api${NC}      — view live logs"
echo -e "    ${YELLOW}pm2 status${NC}                 — check status"
echo -e "    ${YELLOW}pm2 restart advantix-api${NC}   — restart"
echo -e "    ${YELLOW}pm2 stop advantix-api${NC}      — stop"
echo ""
echo -e "  ${CYAN}Database tables + Admin user are auto-created on first boot.${NC}"
echo -e "${GREEN}============================================================${NC}"
