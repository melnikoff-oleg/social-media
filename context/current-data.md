# Current Data

Data lives in **PostgreSQL** (local Docker, host port 5435; `DATABASE_URL`). The app is **multiuser**: every account sees only its own data. Schema: `app/src/lib/db/schema.ts`; migrations: `app/drizzle/`.

## Tables

| Table | Purpose |
|-------|---------|
| `users` | Accounts (email, name, argon2 password hash, role `admin`/`user`, active flag, run and video quotas) |
| `sessions` | Login sessions (cookie based) |
| `configs` | Pipeline configurations (prompts, categories), owned by one user |
| `creators` | Instagram creator accounts to scrape, owned by one user |
| `videos` | Analyzed video results with metrics and AI output, owned by one user |
| `pipeline_runs` | Pipeline runs with state; runs stuck `running` for 15+ minutes are marked `timed_out` at server start |
| `usage_daily` | Daily run and video usage per account (admins have no quota) |
| `admin_audit` | Log of admin actions on other accounts' data |

## Accounts

- No public sign-up. Accounts are created by command line (`npm run create-user`, see the root README).
- New non-admin accounts receive a copy of the starter content (configs and creators).
- Admins use `/admin` to manage quotas, deactivate accounts and edit other accounts' data (audited).
- API keys (Apify, Gemini, Anthropic) are read from `.env` on the server only.

## Legacy CSV files

`data/configs.csv`, `data/creators.csv` and `data/videos.csv` are the old storage. The app no longer uses them; `npm run migrate:csv -- --owner-email <email>` imports them once into an account (videos whose config or creator is missing are counted as orphans). `app/src/scripts/seed.ts` is obsolete and must not be run.

## What The Pipeline Produces

Each video entry includes:
- **Metrics**: views, likes, comments
- **Analysis**: Concept, Hook, Retention Mechanisms, Reward, Script (from Gemini)
- **New Concepts**: Adapted video ideas for the target brand (from Claude)
- **Metadata**: creator, link, thumbnail, dates, config name
