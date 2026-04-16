# Advantix Digital Workspace

## Overview

Full-stack pnpm monorepo for **Advantix Digital** (advantix.digital). A complete digital agency platform with:
- Public marketing website
- Admin dashboard
- Multi-model AI chat tool
- REST API backend

**GitHub**: `thehiddenlogic01/Advantix-Agency-Solutions` (branch: `main`)
**Deployed on**: DigitalOcean App Platform → `https://seal-app-i7x9j.ondigitalocean.app`

---

## Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Node.js | 22 (Docker: `node:22-slim`) |
| Language | TypeScript 5.9 |
| API framework | **Express 5** (not v4 — see critical notes) |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod (`zod/v4`), `drizzle-zod` |
| API codegen | Orval (from OpenAPI spec) |
| Build | esbuild (ESM bundle) |
| Auth | express-session + bcryptjs + Google OAuth 2.0 + Cloudflare Turnstile (session-based, PostgreSQL session store) |
| PDF Parsing | pdf-parse (server-side text extraction from PDF uploads and URLs) |
| TTS | Web Speech API (SpeechSynthesis) — browser-native, no API cost |
| AI Providers | OpenAI (`gpt-4o-mini`, `gpt-4o`), Anthropic (`claude-sonnet-4-6`), Gemini (`gemini-2.5-flash`) |

---

## Admin Credentials

- **Username**: `admin`
- **Password**: from `ADMIN_PASSWORD` env var (default: `2816`)
- **Login endpoint**: `POST /api/auth/login`

---

## Artifacts (Frontend Apps)

| Artifact | Served At | Description |
|----------|-----------|-------------|
| `advantix-website` | `/` | Public marketing website — Home, Portfolio, Team, Contact, Blog, Tools (URL Shortener, Screen Recorder, War Update), user login/dashboard |
| `advantix-admin` | `/admin/` | Protected admin dashboard — grouped sidebar: Management (Tasks, Alerts, Bugs, Contacts, Leads, Users), Marketing (Email, Push, Subscribers, Content, Reports), Content (Blog, Portfolio, Services, Team), System (Tools, AI, Integrations, Assistant Requests, Settings), plus Dashboard and Website Analytics |
| `advantix-ai` | `/ai/` | Multi-model AI chat tool — streaming, GPT/Claude/Gemini auto-routing, landing page builder, memory system |
| `api-server` | — | Express REST API backend (all `/api/*` routes, serves all frontends in production) |

### BASE_PATH per frontend (critical for production)
- `advantix-website`: `BASE_PATH=/` (default)
- `advantix-admin`: `BASE_PATH=/admin/` → Vite builds with `base: "/admin/"`
- `advantix-ai`: `BASE_PATH=/ai/` → Vite builds with `base: "/ai/"`
- All three use `<WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>` for React routing

---

## Project Structure

```
workspace/
├── artifacts/
│   ├── api-server/              Express 5 API server
│   │   ├── src/
│   │   │   ├── app.ts           Express app setup, middleware, static file serving
│   │   │   ├── index.ts         Entry point — runs migrations, seeds, starts server
│   │   │   ├── seed.ts          DB migrations (CREATE TABLE IF NOT EXISTS) + admin seed
│   │   │   ├── routes/          All API routes
│   │   │   │   ├── health.ts    GET /health, GET /healthz (DO health checks)
│   │   │   │   ├── auth.ts      Admin login/logout/me
│   │   │   │   ├── toolsAuth.ts Tool user login/register/logout
│   │   │   │   ├── chat.ts      AI chat widget (public)
│   │   │   │   ├── advantixAi.ts AI tool routes (streaming SSE, memory, sessions)
│   │   │   │   ├── blog.ts      Blog CRUD + image upload (multer)
│   │   │   │   ├── adminTasks.ts Admin task management
│   │   │   │   └── ...          (contacts, leads, portfolio, team, stats, etc.)
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts      requireAdmin, requireToolUser middleware
│   │   │   ├── services/
│   │   │   │   └── telegram.ts  Telegram notification service
│   │   │   └── lib/
│   │   │       └── logger.ts    Pino logger
│   │   ├── build.mjs            esbuild config
│   │   └── package.json
│   ├── advantix-website/        Public website (React + Vite)
│   ├── advantix-admin/          Admin dashboard (React + Vite)
│   └── advantix-ai/             AI tool (React + Vite, dark theme)
├── lib/
│   ├── api-spec/                OpenAPI spec + Orval codegen config
│   ├── api-client-react/        Generated React Query hooks + custom fetch
│   ├── api-zod/                 Generated Zod schemas from OpenAPI
│   ├── db/
│   │   ├── src/
│   │   │   ├── index.ts         DB pool (with SSL config for DO), Drizzle setup
│   │   │   └── schema/          All Drizzle table definitions
│   │   └── drizzle.config.ts
│   ├── integrations-openai-ai-server/
│   ├── integrations-anthropic-ai/
│   └── integrations-gemini-ai/
├── Dockerfile                   Multi-stage Docker build for DO deployment
├── .do/app.yaml                 DigitalOcean App Platform spec
└── pnpm-workspace.yaml          pnpm workspace + rollup native binary config
```

---

## AI Keys — How They Work

AI API keys are stored in the **database** (`integrationsTable`) NOT environment variables. This allows updating keys from the Admin → Integrations page without restarting the server.

- Keys are fetched per-request using helper functions: `getOpenAI()`, `getAnthropic()`, `getGemini()`
- Fallback order: DB value → env var → placeholder (placeholder causes graceful error, not crash)
- Integration names in DB: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`
- Files: `artifacts/api-server/src/routes/advantixAi.ts`, `artifacts/api-server/src/routes/chat.ts`

### AI Routing Logic
The intent classifier in `advantixAi.ts` routes to the best model:
- **Image generation** → `gemini-2.5-flash-image`
- **Code / Reasoning** → `claude-sonnet-4-6` (Anthropic Claude)
- **General chat** → `gpt-4o-mini` (OpenAI)

---

## Database

### Connection (`lib/db/src/index.ts`)
- Reads `DATABASE_URL` from environment
- **Strips `?sslmode=...` from URL** and uses explicit `ssl: { rejectUnauthorized: false }` in production — required for DigitalOcean managed PostgreSQL which uses self-signed certs
- Logs hostname on startup: `[db] Connecting to HOST:PORT/DBNAME`
- Session table created by `ensureSessionTable()` in `seed.ts`

### Key Tables
- `admins` — Admin users (seeded on startup)
- `contacts` — Contact form submissions
- `portfolio_items` — Portfolio projects
- `team_members` — Team member profiles
- `leads` — Service interest leads
- `page_views` — Visitor tracking
- `conversations` / `messages` — Chat widget history
- `tool_users` — Website tool users (URL shortener, AI tool, screen recorder)
- `short_urls` / `url_clicks` — URL shortener + analytics
- `ai_sessions` / `ai_messages` — AI chat sessions and messages
- `ai_usage_logs` — Per-request token + cost tracking
- `ai_user_limits` — Monthly token limits per user
- `ai_memories` — AI user memory entries
- `blog_posts` — Blog articles (TipTap HTML content); `views` (INT) and `likes` (INT) columns added for engagement tracking
- `integrations` — API keys / settings stored in DB (Telegram, OpenAI, etc.)
- `tasks` — Admin task management
- `contests` — Competition/contest listings (title, description, type, rules, prize, deadline, winner)
- `contest_participants` — Contest signups (name, email, phone, accepted_rules)
- `contest_submissions` — Submitted work files (file_url, participant_id, description)
- `recording_sessions` / `recording_stats` — Screen recorder data
- `short_redirect_logs` — URL click logs with geo/device data
- `session` — express-session store (created by connect-pg-simple)
- `admin_permissions` — per-admin page access control (`admin_id`, `page_slug`, `enabled`); also initialized via `ensureAdminPermissionsTable()` in routes/index.ts

### All Migrations Are Automatic
All tables use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `seed.ts → runMigrations()`. The server runs migrations on **every startup** — no manual DB steps are needed on deploy. The migration list in `seed.ts` is the single source of truth.

### DB Commands
```bash
# Push schema changes (safe, uses IF NOT EXISTS in seed.ts)
pnpm --filter @workspace/db run push

# Force push (answers yes to all prompts)
printf "\n\n\n\n" | pnpm --filter @workspace/db run push-force
```

---

## Production Deployment (DigitalOcean)

### How it works — Zero Manual Steps
1. Code is pushed to GitHub (`main` branch)
2. DO detects the push and triggers a new build (auto-deploy is on)
3. Docker build: `node:22-slim` → builds all 3 frontends → bundles API with esbuild → copies dist
4. Container starts → server runs **all DB migrations automatically** (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — fully idempotent)
5. Admin account synced from `ADMIN_PASSWORD` env var
6. Default services and Telegram notification rows seeded (skipped if already present)
7. Single container serves **everything**: API + all 3 frontends (website `/`, admin `/admin/`, AI `/ai/`)

**No manual DB commands, no drizzle-kit push, no seed scripts needed on deploy.**

### app.yaml (`.do/app.yaml`)
- Single `web` service using `Dockerfile`
- Database: `db` (PostgreSQL 17, dev tier `db-s-dev-database`)
- `DATABASE_URL` is bound via `${db.DATABASE_URL}` (DO resolves at deploy time)
- `SESSION_SECRET`, `ADMIN_PASSWORD`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY` are set as encrypted secrets in the DO dashboard

### Required DO Secrets (set in App → Settings → Encrypted Env Vars)
| Key | Required | Description |
|-----|----------|-------------|
| `SESSION_SECRET` | Yes | Long random string for session encryption |
| `ADMIN_PASSWORD` | Yes | Admin login password |
| `OPENAI_API_KEY` | Optional | Can also be set via Admin → Integrations |
| `ANTHROPIC_API_KEY` | Optional | Can also be set via Admin → Integrations |
| `GOOGLE_AI_API_KEY` | Optional | Can also be set via Admin → Integrations |

### Dockerfile
- Stage 1 (builder): Installs all deps, builds all 4 packages
- Stage 2 (runner): Copies only dist files, installs prod deps only
- CMD: `node --enable-source-maps /app/artifacts/api-server/dist/index.mjs`

### Health check
- DO pings `GET /api/health` every 30 seconds
- Failure threshold: 3 attempts before marking degraded
- Initial delay: 30 seconds (gives DB time to connect)

---

## Environment Variables

### In Replit (development)
- `DATABASE_URL` — Auto-provisioned by Replit (PostgreSQL)
- `PORT` — Auto-assigned per artifact workflow
- `SESSION_SECRET` — Set via Replit Secrets

### In DigitalOcean (production)
- `DATABASE_URL` — Resolved from `${db.DATABASE_URL}` (DO managed DB)
- `NODE_ENV` — `production`
- `PORT` — `8080`
- All secrets set via DO dashboard (not in app.yaml)

---

## Critical Technical Notes

### Express 5 (IMPORTANT)
This app uses **Express 5**, NOT Express 4. Express 5 has breaking changes:
- Wildcard routes: Use `"/{*path}"` NOT `"*"` (the old `"*"` throws `PathError`)
- Regex routes ARE still supported: `app.get(/^\/admin(\/.*)?$/, ...)`
- All route params use standard `:param` syntax (unchanged)

### Session Cookie
- Stored in PostgreSQL via `connect-pg-simple`
- In production (DO): `sameSite: "lax"`, `secure: true`, `httpOnly: true`
- In Replit dev: `sameSite: "none"`, `secure: true`, `httpOnly: true` (required for Replit's iframe preview which embeds the app cross-site)
- `trust proxy` is set to 1
- `SESSION_SECRET` is auto-generated if not set (with a warning — sessions won't persist across restarts)
- `customFetch` (api-client-react) uses `credentials: "include"` to ensure cookies are sent in all contexts

### esbuild (api-server)
- `@google/*` is NOT in the external list — `@google/genai` gets bundled
- Do NOT add `@google/*` to external in `artifacts/api-server/build.mjs`
- Both `@rollup/rollup-linux-x64-gnu` and `@rollup/rollup-linux-x64-musl` are enabled in `pnpm-workspace.yaml`

### Blog Image Uploads
- Stored at `uploads/blog/` on the filesystem (project root)
- Served at `/uploads/blog/{filename}` via Express static
- **Production**: All 9 blog cover images are baked into the Docker image via `COPY uploads/ ./uploads/` so they survive every deployment
- New images uploaded via admin panel persist only until the next redeploy (no DO volume configured on `basic-xxs`). Upgrade to Professional plan + add a DO volume at `/app/uploads` for persistent new uploads, or use DO Spaces / S3

### Admin API Calls
- Always use absolute paths: `/api/admin/...`
- Never use `${BASE_URL}/api/...` in admin — BASE_URL is `/admin/` which would produce `/admin/api/...` (wrong)

---

## Admin Dashboard — Key Features

### Dashboard (two-tab layout)
- **Overview tab** — 12 metric cards: Registered Users, Admin Accounts, AI Requests, Pending Chats, Pending Tasks, Bug Reports, Unread Inbox, Emails Sent Today, Integrations status, Active Visitors, Today's Views, Active Users (30d). Cards with pending items show an orange pulse dot. Below: Top Pages Today + Recent Activity Feed (live feed across all tables with relative timestamps).
- **Tools Dashboard tab** — URL shortener stats (links, clicks, referrers, devices, browsers), Screen Recorder stats, PDF Audio stats, AI usage (model breakdown, cost), Top users by link clicks / recording time / AI usage.
- API endpoints: `GET /api/admin/overview-stats`, `GET /api/admin/tools/stats`

### Admin Permission System
- `admin_permissions` table: per-admin access to each dashboard page section
- Super admins: unrestricted access (Crown badge in UI)
- Regular admins: toggleable per-section (Dashboard, Management, Project Management, Marketing, Content, Social Media, Analytics, Finance, System, Admin Settings)
- `admin-settings` is disabled by default for new admins
- `GET /api/auth/my-admin-permissions` returns allowed page slugs; sidebar filters nav accordingly
- Managed via **Admin Settings → User Permission → Admin Management tab**

### Tool Permissions
- 4 tools: `url-shortener`, `screen-recorder`, `pdf-audio`, `advantix-ai`
- Global defaults in `site_settings` key `default_tool_permissions`
- Per-user overrides in `user_tool_permissions(user_id, tool_slug, enabled)`
- Frontend: `ToolsUserContext` carries `allowedTools`; `ToolGuard` in `App.tsx` redirects; `Tools.tsx` shows "No Access" badges
- API: `GET /api/admin/tool-permissions/defaults`, `PUT /api/admin/tool-permissions/defaults`, `GET /api/admin/tool-permissions/users`, `PUT /api/admin/tool-permissions/user/:userId`

---

## Security Architecture

### HTTP Security Headers (Helmet)
All responses include these headers:
- `X-Content-Type-Options: nosniff` — blocks MIME-type sniffing attacks
- `X-Frame-Options: SAMEORIGIN` — prevents clickjacking via iframes
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — forces HTTPS (HSTS)
- `Cross-Origin-Opener-Policy: same-origin` — prevents cross-origin window hijacking
- `Referrer-Policy: no-referrer` — hides page URLs from third-party referrer tracking
- `X-Powered-By` header is **removed** — hides "Express" from attackers

### Rate Limiting (express-rate-limit, per IP)
| Endpoint | Limit | Window | Purpose |
|----------|-------|--------|---------|
| `POST /api/auth/login` | **10 req** | 15 min | Block brute-force login attacks |
| `POST /contacts`, `/leads`, `/bugs`, `/contests/:id/submit` | **5 req** | 30 min | Stop contact/lead/bug spam bots |
| `POST /chat`, `/chat/stream` | **30 req** | 10 min | Prevent AI cost abuse |
| All `/api/*` routes | **300 req** | 15 min | Block API scanners & DDoS |

### Request Body Limits
- JSON body: **2 MB** (was 20 MB — oversized JSON bodies rejected with HTTP 413)
- File uploads: handled by multer with per-route limits (10–20 MB)

### Auth Security
- Failed logins logged (username + timestamp) for monitoring
- Sessions: `httpOnly`, `secure`, `sameSite: lax`, 30-day rolling TTL

### Error Handling
- In production: generic "An unexpected error occurred." (no stack trace leakage)
- In development: full error message + stack shown for debugging

---

## Known Bugs Fixed (History)

| Bug | Fix Applied |
|-----|-------------|
| Express 5 `"*"` wildcard route crash (`PathError`) | Changed to `"/{*path}"` in `app.ts` |
| DO health check always failing | Added `GET /api/health` endpoint (was only `/api/healthz`) |
| SSL certificate error with DO managed PostgreSQL | Strip `sslmode` from URL + `ssl: { rejectUnauthorized: false }` in `lib/db/src/index.ts` |
| `SESSION_SECRET` missing caused crash | Auto-generate random secret with warning log |
| AI keys were hardcoded / crashed on missing key | Moved to DB-driven `getOpenAI()` / `getAnthropic()` / `getGemini()` helpers |
| `ToolsDashboard` blank screen after login | Missing `loading` guard — was redirecting before session check completed |
| Vite sourcemap warnings during build | Added `sourcemap: false` + `onwarn` suppression in all 3 Vite configs |
| "Internal Server Error" after admin login (production) | `connect-pg-simple` session store was using `conString: process.env.DATABASE_URL` (raw URL, no SSL config) — fixed by passing the shared `pool` (which has `ssl: { rejectUnauthorized: false }`) via `new PgSession({ pool })` in `app.ts` |
| Admin login fails after redeploy / password change | `seedAdmin()` only created admin if row didn't exist — now it ALSO updates the `passwordHash` on every startup to stay in sync with `ADMIN_PASSWORD` env var. No more stale passwords. |
| Blog cover images missing in production | `Dockerfile` had `RUN mkdir -p /app/uploads` (empty dir). Fixed: `COPY uploads/ ./uploads/` bakes all 9 blog covers into the image |
| `Notifications.tsx` runtime crash on test result | `apiFetch()` returns `unknown`; `.ok`/`.error` accessed directly. Fixed: explicit `as { ok: boolean; error?: string }` cast |
| `RichEditor.tsx` blog editor content not syncing | `editor.commands.setContent(content, false)` — tiptap v3 removed the boolean 2nd arg. Fixed: `setContent(content, { emitUpdate: false })` |
| `Tasks.tsx` ref null pointer | `RefObject<HTMLInputElement>` doesn't accept `null` from React 19's `useRef`. Fixed prop type to `RefObject<HTMLInputElement \| null>` |
| `BugReports.tsx` invalid `title` on Lucide icon | `title` is not a valid prop on Lucide components. Fixed: changed to `aria-label` |
| `Careers.tsx` + `ContestDetail.tsx` broken canonical URLs | Passed `path` prop to `<SEO>` component but `SEOProps` only has `canonical`. Fixed: renamed to `canonical` |
| `Services.tsx` (website) unsafe Lucide type cast | Double cast `as unknown as Record<...>` to avoid overlapping-type TS error |
| `UrlShortener.tsx` Analytics type mismatch | API return type slightly differs from local `Analytics` type. Fixed: `.then(d => setData(d as Analytics))` |
| `ScreenRecorder.tsx` SharedArrayBuffer incompatible | `Uint8Array.buffer` is `ArrayBufferLike`; `Blob` needs `ArrayBuffer`. Fixed: `data.buffer as ArrayBuffer` |
| `Portfolio.tsx` (website) `unknown` used as React Key/ReactNode | api-client-react `dist/` not built, causing all imported types to be unknown. Fixed: ran `tsc -b` to generate declaration files |
| `@tiptap/core` module not found in admin | Imported but not in package.json. Fixed: added `"@tiptap/core": "^3.22.2"` to admin dependencies |
| SMM scheduler fires immediately for posts >24.8 days away | Node.js `setTimeout` silently wraps past 2^31ms. Fixed: `schedulePost()` re-schedules itself in ~23-day chunks until within range |

---

## API Routes Summary

All routes prefixed with `/api`.

### Public (No Auth)
- `GET /api/health`, `GET /api/healthz` — Health check (DO uses `/health`)
- `POST /api/auth/login` — Admin login
- `GET /api/auth/me` — Session status check
- `POST /api/contacts` — Contact form
- `GET /api/portfolio` — Portfolio items
- `GET /api/team` — Team members
- `GET /api/blog` — Published blog posts
- `GET /api/blog/:slug` — Single blog post
- `POST /api/leads` — Lead submission
- `POST /api/chat` — AI chat widget

### Tool Users (tool session required)
- `GET /api/tools/auth/me` — Current tool user
- `POST /api/tools/auth/login` — Tool user login
- `POST /api/tools/auth/register` — Tool user register
- `POST /api/tools/auth/logout` — Tool user logout
- `GET /api/ai/sessions` — List AI sessions
- `POST /api/ai/sessions` — Create AI session
- `GET /api/ai/sessions/:id/messages` — Get messages
- `DELETE /api/ai/sessions/:id` — Delete session
- `POST /api/ai/chat/:sessionId` — Stream AI chat (SSE)
- `GET /api/ai/usage/me` — Token usage for current user
- `GET /api/tools/urls` — List short URLs
- `POST /api/tools/urls` — Create short URL
- `DELETE /api/tools/urls/:id` — Delete short URL
- `GET /api/tools/recordings/stats` — Screen recording stats

### Contests (Public + Admin)
- `GET /api/contests` — List active contests (public)
- `GET /api/contests/:id` — Single contest with submissions (public)
- `POST /api/contests/:id/signup` — Participant signup (public)
- `POST /api/contests/:id/submit` — Submit work with file upload (public, multer)
- `GET /api/admin/contests` — List all contests (admin)
- `GET /api/admin/contests/:id` — Contest detail with all submissions (admin)
- `POST /api/admin/contests` — Create contest (admin)
- `PUT /api/admin/contests/:id` — Update contest (admin)
- `DELETE /api/admin/contests/:id` — Delete contest + all related data (admin)
- `POST /api/admin/contests/:id/winner` — Select winner submission (admin)
- `POST /api/admin/contests/upload-image` — Upload cover image (admin)

### Admin Only (`requireAdmin` middleware)
- `POST /api/auth/logout` — Admin logout
- `GET /api/contacts`, `GET /api/leads`, `GET /api/stats` — Data views
- `GET/POST/PUT/DELETE /api/admin/blog` — Blog management
- `POST /api/admin/blog/upload-image` — Image upload (multer, field: `image`)
- `GET /api/admin/integrations` — List integrations (API keys stored in DB)
- `PUT /api/admin/integrations/:id` — Update integration value
- `GET /api/ai/admin/stats` — AI usage stats
- `GET /api/ai/admin/users` — Per-user AI usage
- `PUT /api/ai/admin/users/:id/limit` — Set user token limit
- `GET /api/admin/tasks`, `POST/PUT/PATCH/DELETE /api/admin/tasks/:id` — Task management
- `GET/PUT /api/admin/notifications/settings` — Telegram notification config
- `GET /api/admin/users`, `POST/DELETE /api/admin/users/:id` — Tool user management
- Email Marketing (`/api/email/*`):
  - `GET/POST /api/email/senders`, `PUT/DELETE /api/email/senders/:id` — Sender management
  - `GET/POST /api/email/templates`, `PUT/DELETE /api/email/templates/:id`, `POST .../duplicate` — Template CRUD
  - `GET/POST /api/email/contacts`, bulk, import-leads, import-site-contacts, `PUT/DELETE ./:id`, bulk-delete — Contact management
  - `GET/POST /api/email/campaigns`, `PUT/DELETE ./:id`, `POST ./:id/send`, `POST ./:id/duplicate` — Campaign CRUD
  - `GET /api/email/campaigns/:id/report` — Campaign performance report
  - `POST /api/email/send-single` — Send single email (to, toName, subject, htmlContent, senderId, templateId)
  - `GET /api/email/stats` — Dashboard stats
  - `GET /api/email/lists` — Contact list summary
  - `POST /api/email/webhook` — Resend webhook receiver (unauthenticated)
  - **Resend integration active**: API key stored in `integrations` DB table (name=`RESEND_API_KEY`). Verified domain: `advantix.digital`. Default sender: `noreply@advantix.digital`. Both single-send and campaign-send use real Resend delivery.
  - 8 ready-made templates seeded: Welcome New Client, Project Update, Invoice Reminder, Monthly Newsletter, Project Completion, Feedback Request, Special Offer, New Service Announcement

---

## Development Workflows

Each artifact has its own workflow in Replit:
- `artifacts/api-server: API Server` — Express server on port 8080
- `artifacts/advantix-website: web` — Vite dev server
- `artifacts/advantix-admin: web` — Vite dev server (BASE_PATH=/admin/)
- `artifacts/advantix-ai: web` — Vite dev server (BASE_PATH=/ai/)

### Common Commands
```bash
# Build all
pnpm run build

# Typecheck all
pnpm run typecheck

# Regenerate API client after OpenAPI spec changes
pnpm --filter @workspace/api-spec run codegen

# Push DB schema
pnpm --filter @workspace/db run push

# Build specific package
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/advantix-website run build
BASE_PATH=/admin/ pnpm --filter @workspace/advantix-admin run build
BASE_PATH=/ai/ pnpm --filter @workspace/advantix-ai run build
```

---

## Website Tools Section (/tools)

The main website has a built-in tools section for registered users:
- `/tools` — Tools landing page
- `/tools/dashboard` — User dashboard (short URLs, recordings, AI usage stats)
- `/tools/url-shortener` — URL shortener with click analytics
- `/tools/screen-recorder` — In-browser screen recorder (up to 10 min)
- `/tools/war-update` — War news updates page
- `/tools/settings` — Account settings
- `/login` — Standalone login page (same as modal login)

Tool users log in with email/password (separate from admin). Session stored in `tool_users` table.

---

## Telegram Notifications

Configured via Admin → Notifications. Settings stored in `integrations` DB table:
- `TELEGRAM_BOT_TOKEN` — Bot token
- `TELEGRAM_CHAT_ID` — Chat/channel ID
- `TELEGRAM_NOTIFICATIONS_ENABLED` — `true`/`false`
- `TELEGRAM_NOTIFY_TASK_CREATED` / `TELEGRAM_NOTIFY_TASK_ASSIGNED` / `TELEGRAM_NOTIFY_TASK_STATUS` — per-event toggles
