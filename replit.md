# Advantix Agency Workspace

## Overview

Full-stack pnpm workspace monorepo for Advantix Agency (advantix.agency). A complete digital agency platform with public website, admin dashboard, REST API backend, and multi-model AI tool.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle) — `@google/*` is NOT externalized (bundles `@google/genai` directly)
- **Auth**: express-session + bcryptjs (session-based)
- **AI Providers**: Replit AI Integrations — OpenAI (`gpt-4o-mini`, `gpt-4o`), Anthropic (`claude-sonnet-4-6`), Gemini (`gemini-2.5-flash`, `gemini-2.5-flash-image`)

## Admin Credentials

- **Username**: `admin`
- **Password**: `2816`
- **Login endpoint**: `POST /api/auth/login`

## Artifacts

| Artifact | Path | Description |
|---|---|---|
| `advantix-website` | `/` | Public-facing marketing website (Home, Portfolio, Team, Contact, Blog, Tools) |
| `advantix-admin` | `/admin/` | Protected admin dashboard (login, dashboard, contacts, leads, portfolio, team, blog, AI management) |
| `advantix-ai` | `/ai/` | Multi-model AI chat tool (login-gated, streaming, GPT/Claude/Gemini router) |
| `api-server` | — | Express REST API backend (all `/api/*` routes) |

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── advantix-website/   # Public marketing site (React + Vite)
│   ├── advantix-admin/     # Admin dashboard (React + Vite)
│   └── advantix-ai/        # Advantix AI chat tool (React + Vite, dark theme)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   ├── integrations-openai-ai-server/   # OpenAI server-side helpers
│   ├── integrations-openai-ai-react/    # OpenAI React hooks
│   ├── integrations-anthropic-ai/       # Anthropic (Claude) server-side helpers
│   └── integrations-gemini-ai/          # Gemini server-side helpers + image generation
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
- `GET /api/blog` — List published blog posts
- `GET /api/blog/:slug` — Get a single blog post by slug
- `POST /api/leads` — Track a lead/interest
- `POST /api/track` — Track a page view
- `POST /api/chat` — AI chat assistant (gpt-4o-mini, Advantix-focused system prompt)

### Tool User Routes (Tool Session Required)
- `GET /api/tools/auth/me` — Get current tool user
- `POST /api/tools/auth/login` — Tool user login
- `POST /api/tools/auth/register` — Tool user register
- `POST /api/tools/auth/logout` — Tool user logout
- `GET /api/ai/sessions` — List AI chat sessions
- `POST /api/ai/sessions` — Create new AI session
- `GET /api/ai/sessions/:id/messages` — Get session messages
- `DELETE /api/ai/sessions/:id` — Delete session
- `POST /api/ai/chat/:sessionId` — Stream AI chat (SSE) — auto-routes to best model
- `POST /api/ai/feedback` — Submit message feedback (thumbs up/down)
- `GET /api/ai/usage/me` — Get current user's token usage

### Admin-Only Routes (Session Required)
- `POST /api/auth/logout` — Logout
- `GET /api/contacts` — List all contacts
- `GET /api/leads` — List all leads
- `GET /api/stats` — Get visitor stats
- `GET /api/admin/blog` — List all blog posts (drafts + published)
- `GET /api/admin/blog/:id` — Get a single post by ID
- `POST /api/admin/blog` — Create a new post
- `PUT /api/admin/blog/:id` — Update a post
- `DELETE /api/admin/blog/:id` — Delete a post
- `POST /api/admin/blog/upload-image` — Upload cover/inline image (multipart, field: `image`)
- `GET /api/ai/admin/stats?period=week|month|all` — AI usage stats by provider
- `GET /api/ai/admin/users` — Per-user AI usage and costs
- `PUT /api/ai/admin/users/:id/limit` — Set monthly token limit for a user

## Database Schema

Tables (all managed by Drizzle ORM):
- `admins` — Admin users (seeded with admin/2816 on startup)
- `contacts` — Contact form submissions
- `portfolio_items` — Portfolio projects
- `team_members` — Team member profiles
- `leads` — Service interest leads
- `page_views` — Visitor page tracking
- `conversations` / `messages` — Chat widget conversation history
- `tool_users` — Registered tool users (for URL shortener, Screen Recorder, AI tool)
- `short_urls` / `url_clicks` — URL shortener data
- `ai_sessions` — AI chat sessions (linked to tool_users)
- `ai_messages` — Individual AI messages with provider/model/token info
- `ai_usage_logs` — Per-request token + cost tracking by provider
- `ai_user_limits` — Monthly token limits per user (admin-configurable)
- `blog_posts` — Blog articles (title, slug, content HTML via TipTap, cover image, status, SEO fields)

## AI Routing Logic (advantixAi.ts)

The intent classifier routes messages to the best provider:
- **Image requests** → `gemini-2.5-flash-image` (Gemini image generation)
- **Code requests** → `claude-sonnet-4-6` (Anthropic Claude)
- **Reasoning/analysis** → `claude-sonnet-4-6` (Anthropic Claude)
- **General chat** → `gpt-4o-mini` (OpenAI)

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Replit)
- `SESSION_SECRET` — Express session secret
- `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI proxy for OpenAI
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` + `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Replit AI proxy for Claude
- `AI_INTEGRATIONS_GEMINI_BASE_URL` + `AI_INTEGRATIONS_GEMINI_API_KEY` — Replit AI proxy for Gemini
- `PORT` — Server port (auto-assigned per artifact)

## Critical Notes

- **esbuild external list**: `@google/*` was changed to `@google-cloud/*` so that `@google/genai` gets bundled (not externalized). Do NOT add `@google/*` back to the external list in `artifacts/api-server/build.mjs`.
- **Admin BASE_URL bug pattern**: Admin app has `BASE_URL=/admin/`. Never use `${BASE_URL}/api/...` in admin — always use `/api/...` directly.
- **DB push**: Use `pnpm --filter @workspace/db run push-force` with `printf "\n\n\n\n" | ...` if there are rename prompts.

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all lib packages as project references.

- **Always typecheck from the root** — `pnpm run typecheck`
- **Run codegen after OpenAPI changes** — `pnpm --filter @workspace/api-spec run codegen`
- **Push DB schema changes** — `pnpm --filter @workspace/db run push`
