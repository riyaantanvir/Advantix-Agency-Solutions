# Advantix Agency Workspace

## Overview

Full-stack pnpm workspace monorepo for Advantix Agency (advantix.agency). A complete digital agency platform with public website, admin dashboard, and REST API backend.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **Auth**: express-session + bcryptjs (session-based)
- **AI**: Replit AI Integrations (OpenAI-compatible, gpt-5.2)

## Admin Credentials

- **Username**: `admin`
- **Password**: `2816`
- **Login endpoint**: `POST /api/auth/login`

## Artifacts

| Artifact | Path | Description |
|---|---|---|
| `advantix-website` | `/` | Public-facing marketing website (Home, Portfolio, Team, Contact) |
| `advantix-admin` | `/admin/` | Protected admin dashboard (login, dashboard, contacts, leads, portfolio, team) |
| `api-server` | — | Express REST API backend (all `/api/*` routes) |

Admin dashboard credentials: **username=admin / password=2816** (login at `/admin/login`)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── advantix-website/   # Public marketing site (React + Vite)
│   └── advantix-admin/     # Admin dashboard (React + Vite)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   ├── integrations-openai-ai-server/  # OpenAI server-side helpers
│   └── integrations-openai-ai-react/   # OpenAI React hooks
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml     # pnpm workspace config
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## API Routes

All routes are prefixed with `/api`.

### Public Routes (No Auth Required)
- `GET /api/healthz` — Health check
- `POST /api/auth/login` — Admin login (body: {username, password})
- `GET /api/auth/me` — Check session status
- `POST /api/contacts` — Submit contact form
- `GET /api/portfolio` — List portfolio items
- `GET /api/team` — List team members
- `POST /api/leads` — Track a lead/interest
- `POST /api/track` — Track a page view
- `POST /api/chat` — AI chat assistant (gpt-5.2, Advantix-focused system prompt)

### Admin-Only Routes (Session Required)
- `POST /api/auth/logout` — Logout
- `GET /api/contacts` — List all contacts
- `PATCH /api/contacts/:id` — Mark contact as replied
- `DELETE /api/contacts/:id` — Delete contact
- `POST /api/portfolio` — Create portfolio item
- `PUT /api/portfolio/:id` — Update portfolio item
- `DELETE /api/portfolio/:id` — Delete portfolio item
- `POST /api/team` — Create team member
- `PUT /api/team/:id` — Update team member
- `DELETE /api/team/:id` — Delete team member
- `GET /api/leads` — List all leads
- `GET /api/stats` — Get visitor stats (active visitors, today's views, top pages)

## Database Schema

Tables (all managed by Drizzle ORM):
- `admins` — Admin users (seeded with admin/2816 on startup)
- `contacts` — Contact form submissions
- `portfolio_items` — Portfolio projects
- `team_members` — Team member profiles
- `leads` — Service interest leads
- `page_views` — Visitor page tracking
- `conversations` / `messages` — AI conversation history (from OpenAI integration)

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Replit)
- `SESSION_SECRET` — Express session secret
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit AI proxy URL
- `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI proxy API key
- `PORT` — Server port (auto-assigned per artifact)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all lib packages as project references.

- **Always typecheck from the root** — `pnpm run typecheck`
- **Run codegen after OpenAPI changes** — `pnpm --filter @workspace/api-spec run codegen`
- **Push DB schema changes** — `pnpm --filter @workspace/db run push`

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes in `src/routes/`, middleware in `src/middleware/`.
- Entry: `src/index.ts` — reads PORT, seeds admin, starts Express
- App: `src/app.ts` — CORS, JSON, session middleware, routes at `/api`
- Seed: `src/seed.ts` — Seeds admin user (admin/2816) on startup if not exists

### `lib/db` (`@workspace/db`)

Database layer. All schema files in `src/schema/`.
- Run migrations: `pnpm --filter @workspace/db run push`
- Force migrate: `pnpm --filter @workspace/db run push-force`

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec (`openapi.yaml`) — source of truth for all API contracts.
- Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/integrations-openai-ai-server`

Server-side OpenAI helpers. Exports `openai` (SDK client), image, audio, and batch utilities.

### `lib/integrations-openai-ai-react`

React-side OpenAI hooks for voice/audio.
