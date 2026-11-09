# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What This Is

**Social Media AI** — a tool that helps create viral Instagram Reels by analyzing competitor content. It scrapes competitors' recent videos, identifies the most viral ones, analyzes them with AI (video understanding + content breakdown), and generates new adapted video concepts for a given brand.

---

## How to Run

```bash
docker compose up -d db        # from the repo root: local PostgreSQL on host port 5435
cd app
npm install
npm run db:migrate
npm run create-user -- --email you@example.com --name "You" --role admin
npm run dev
# Open http://localhost:3000 and sign in (no public sign-up)
```

**Required environment variables** (in `.env` at project root):
- `APIFY_API_TOKEN` — Apify Instagram scraper
- `GEMINI_API_KEY` — Google Gemini video analysis
- `ANTHROPIC_API_KEY` — Claude concept generation
- `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` — optional, DeepSeek concept generation (model defaults to `deepseek-chat`)
- `DATABASE_URL` — app database (local: `postgres://app:app@localhost:5435/social_media`)
- `TEST_DATABASE_URL` — separate database used only by `npx vitest run`

---

## Tech Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** components
- **PostgreSQL** (Docker) + **Drizzle ORM**, multiuser with login, per-account quotas and admin role
- Old CSV files in `data/` are legacy (import once with `npm run migrate:csv`)
- **Apify** — Instagram scraping
- **Google Gemini (default gemini-2.5-flash)** — Video analysis (upload + multimodal)
- **Claude Sonnet** or **DeepSeek** — New concept generation (chosen per run on the Run page)

---

## How The System Works

### Pipeline Overview

1. **Input** — Select a config and parameters (max videos, top-K, days lookback) via the Run page
2. **Load Config** — Retrieve analysis prompt, new concepts prompt, and creator list from the account's database
3. **Scrape** — For each competitor creator, scrape recent Instagram Reels via Apify
4. **Filter & Rank** — Filter by date, sort by views, take top-K most viral
5. **Analyze** — Download video, upload to Gemini, analyze (extracts Concept, Hook, Retention, Reward, Script)
6. **Generate** — Send analysis + brand context to Claude for adapted video concepts
7. **Save** — Insert results into the `videos` table (scoped to the account), viewable in the Videos page with thumbnails

Every request is scoped to the logged-in account; runs consume the account's daily quota (admins have none).

### Two Customizable Prompts Per Config

- **Analysis Instruction** — How Gemini should break down the video
- **New Concepts Instruction** — How Claude should adapt the reference for the brand

---

## Workspace Structure

```
.
├── CLAUDE.md                              # This file
├── .env                                   # API keys (not committed)
├── app/                                   # Next.js application
│   ├── src/
│   │   ├── app/                           # Pages and API routes
│   │   │   ├── page.tsx                   # Dashboard
│   │   │   ├── videos/page.tsx            # Videos browser with thumbnails
│   │   │   ├── run/page.tsx               # Pipeline runner with live progress
│   │   │   ├── configs/page.tsx           # Config management
│   │   │   ├── creators/page.tsx          # Creator management
│   │   │   ├── login/page.tsx             # Login
│   │   │   ├── admin/page.tsx             # Admin panel (users, quotas, deactivation, account selector)
│   │   │   └── api/                       # API routes (auth, admin, configs, creators, videos, pipeline, proxy-image)
│   │   ├── lib/                           # Core logic
│   │   │   ├── pipeline.ts               # Pipeline orchestration
│   │   │   ├── apify.ts                  # Apify scraper client
│   │   │   ├── gemini.ts                 # Gemini video analysis client
│   │   │   ├── claude.ts                 # Claude concept generation client
│   │   │   ├── deepseek.ts               # DeepSeek concept generation client (same signature)
│   │   │   ├── csv.ts                    # Legacy CSV utilities
│   │   │   ├── db/                       # Drizzle schema, connection, migrate runner
│   │   │   ├── auth/                     # Sessions, password hashing, rate limit, require-session
│   │   │   ├── repo/                     # Per-account data access (configs, creators, videos, admin audit)
│   │   │   ├── quota/                    # Daily run/video quota reservation
│   │   │   ├── pipeline/runs.ts          # Run state (running/timed_out), stale-run cleanup
│   │   │   ├── accounts/                 # Starter content copied to new accounts
│   │   │   ├── api/                      # Route helpers, serializers, image URL allowlist
│   │   │   ├── client/                   # Browser fetch helper, use-me hook
│   │   │   └── types.ts                  # TypeScript interfaces
│   │   └── components/                    # UI components (shadcn + custom)
│   ├── drizzle/                           # SQL migrations
│   ├── src/scripts/                       # account.ts (user commands), migrate-csv.ts, seed.ts (OBSOLETE, do not run)
│   └── package.json
├── docker-compose.yml                     # Local PostgreSQL (host port 5435)
├── data/                                  # Legacy CSV data (read only by migrate:csv)
├── context/                               # Background context for Claude
├── plans/                                 # Implementation plans
└── .claude/commands/                      # Slash commands (prime, create-plan, implement)
```

---

## App Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Summary stats, recent videos |
| Videos | `/videos` | Browse results with thumbnails, expandable analysis & concepts |
| Run Pipeline | `/run` | Select config, set params, run with live progress streaming |
| Configs | `/configs` | CRUD for pipeline configs (prompts, categories) |
| Creators | `/creators` | CRUD for competitor Instagram accounts |
| Login | `/login` | Email + password sign-in |
| Admin | `/admin` | Admins only: users, quotas, deactivate accounts, act on other accounts' data (audited) |

---

## npm Scripts (run in `app/`)

`db:migrate`, `db:generate`, `create-user`, `reset-password`, `disable-user`, `enable-user`, `delete-user` (all take `-- --email <e>`), `migrate:csv -- --owner-email <e>`. Details and the manual test checklist are in the root `README.md`, which also lists known issues and security residuals for the VPS stage.

---

## Commands

### /prime
Initialize a new session with full context awareness.

### /create-plan [request]
Create a detailed implementation plan in `plans/`.

### /implement [plan-path]
Execute a plan step by step.

---

## Critical Instruction: Maintain This File

After any change to the workspace, ask:
1. Does this change add new functionality?
2. Does it modify the workspace structure documented above?
3. Should a new command be listed?
4. Does context/ need updates?

If yes, update the relevant sections.

---

## Session Workflow

1. **Start**: Run `/prime` to load context
2. **Work**: Use commands or direct Claude with tasks
3. **Plan changes**: Use `/create-plan` before significant additions
4. **Execute**: Use `/implement` to execute plans
5. **Maintain**: Claude updates CLAUDE.md and context/ as the workspace evolves
