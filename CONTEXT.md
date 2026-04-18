# Advantix Digital — Agent Context File
> Read this file first before any task. Update the "Current Focus" section after each session.

---

## Project Overview
**Advantix Digital** — Full-stack digital agency platform.
- Public website + Tools (AI assistant, URL shortener, PDF tools, screen recorder)
- Admin dashboard (CMS, CRM, blog, projects, social media manager)
- Separate AI chat app
- Express 5 REST API backend

---

## Stack
| Layer | Tech |
|---|---|
| Frontend (website) | React + Vite + TypeScript + TailwindCSS + shadcn/ui |
| Frontend (admin) | React + Vite + TypeScript + TailwindCSS |
| Frontend (AI app) | React + Vite + TypeScript |
| Backend | Express 5 + TypeScript + Drizzle ORM |
| Database | PostgreSQL (Drizzle schema, no raw SQL migrations) |
| Auth | Session-based (express-session + pg store) |
| Storage | Object storage (custom lib) |
| Deployment | DigitalOcean App Platform |

---

## Monorepo Structure (pnpm workspaces)
```
/artifacts
  /advantix-website   → Public site + Tools (port 3000, path /)
  /advantix-admin     → Admin dashboard (port 3001, path /admin)
  /advantix-ai        → Standalone AI chat (port 3002, path /ai)
  /api-server         → Express API (port 8080)
  /mockup-sandbox     → UI component preview (port 8081)
/packages
  /shared             → Shared types/utils
```

---

## Key Files — API Server (`artifacts/api-server/src/`)

### Routes
| File | Purpose |
|---|---|
| `routes/advantixAssistant.ts` | AI agent chat (SSE streaming, tool execution, multi-model) |
| `routes/auth.ts` | Login/logout/session |
| `routes/contacts.ts` | CRM contacts |
| `routes/adminProjects.ts` | Project management |
| `routes/smm.ts` | Social media manager |
| `routes/blog.ts` | Blog CRUD |
| `routes/inbox.ts` | Client messaging |
| `routes/contentStudio.ts` | AI content generation |
| `routes/toolsPdfAudio.ts` | PDF/audio tools |
| `routes/storage.ts` | File uploads |
| `routes/adminUsers.ts` | User management |
| `routes/toolPermissions.ts` | Per-tool API key management |

### Lib
| File | Purpose |
|---|---|
| `lib/agentScript.ts` | Generates downloadable agent.mjs for users |
| `lib/agentManager.ts` | WebSocket ping/pong, agent Map (single instance only) |
| `lib/smmService.ts` | Social media scheduling/posting |
| `lib/objectStorage.ts` | File storage abstraction |
| `lib/cache.ts` | In-memory caching |

---

## Key Files — Website (`artifacts/advantix-website/src/`)

### Pages
| File | Purpose |
|---|---|
| `pages/AssistantPage.tsx` | AI agent chat UI (1350 lines) — live status bar, tool cards, agent settings |
| `pages/Home.tsx` | Landing page |
| `pages/Tools.tsx` | Tools dashboard |
| `pages/SocialMediaTool.tsx` | SMM UI |
| `pages/UrlShortener.tsx` | URL shortener |
| `pages/PdfAudio.tsx` | PDF/audio tools |

### Components
| File | Purpose |
|---|---|
| `components/layout/Navbar.tsx` | Top navigation |
| `components/layout/Footer.tsx` | Site footer |
| `components/layout/AppLayout.tsx` | Page transition wrapper |

---

## AI Assistant — Important Details (`advantixAssistant.ts`)
- **Models supported**: Claude (Anthropic), Gemini (Google), GPT-4o (OpenAI), OpenRouter
- **Default model**: claude-sonnet-4-5 (expensive — suggest Gemini Flash for simple tasks)
- **Prompt caching**: Enabled for Anthropic (`anthropic-beta: prompt-caching-2024-07-31`)
- **History**: Last 8 DB rows per conversation
- **Max tool rounds**: 5 per message
- **Max output tokens**: tool round=768, final=2048
- **Tool result truncation**: 1000 chars (in-session), 400 chars (history)
- **System prompt**: Never says "done/completed" — just shows results
- **Agent tools**: `run_command`, `read_file`, `write_file`, `list_directory`, `open_vscode`, `get_cwd`

---

## Database Rules
- **NEVER change primary key ID column types** (serial ↔ varchar breaks migrations)
- Schema changes: edit Drizzle schema file → run `pnpm --filter @workspace/api-server run db:push`
- No raw SQL migration files — Drizzle handles it

---

## Dev Commands
```bash
# Start all services
pnpm --filter @workspace/api-server run dev        # API (port 8080)
pnpm --filter @workspace/advantix-website run dev  # Website (port 3000)
pnpm --filter @workspace/advantix-admin run dev    # Admin (port 3001)

# Build API
pnpm --filter @workspace/api-server run build

# DB push
pnpm --filter @workspace/api-server run db:push
```

---

## Deployment
- Platform: **DigitalOcean App Platform**
- Container count: **1** (must stay at 1 — WebSocket agent breaks with multiple containers)
- After code changes: Publish from Replit → auto-deploys to DO
- Agent.mjs: Users must re-download after each agentScript.ts change

---

## Current Focus
> Update this section at the end of each work session.

**Last updated**: 2026-04-18

**Recently completed**:
- Token optimization: prompt caching, reduced history (11→8), MAX_TOOL_ROUNDS (8→5), max_tokens (4096→2048)
- Live status bar added above input box (shows running tool in real-time, zero extra tokens)
- System prompt: AI no longer announces task completion
- Windows support for agent download script
- Agent disconnect fix (single DO container)
- Feature showcase cards in empty state of AssistantPage

**Currently working on**: —

**Next tasks**: —

---

## Notes & Gotchas
- `AssistantPage.tsx` has a pre-existing TS error at line ~512 — ignore it
- Agent WebSocket uses in-memory Map — DO container count MUST be 1
- Bengali-speaking user — can respond in Bangla
- `agentScript.ts` generates the downloadable `agent.mjs` — users need to re-download after changes
- Token pricing: Claude Sonnet $3/$15 per 1M, Gemini Flash $0.075/$0.30
