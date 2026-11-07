# Social Media AI

Find the Reels that are working in your niche, understand why, and get new concepts written for your brand.

It scrapes a list of competitors' recent Instagram videos, picks the most viral ones, has an AI watch them and break them down shot by shot, then writes fresh video concepts adapted to you.

Full walkthrough: **[oleg.ae/claude-reels](https://oleg.ae/claude-reels)**

---

## Setup

You need [Node.js](https://nodejs.org) (LTS), [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the local PostgreSQL) and three API keys.

```bash
# 1. get the code
git clone https://github.com/melnikoff-oleg/social-media.git
cd social-media

# 2. make your .env from the template
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env

# 3. open .env and paste your three keys in

# 4. start the local PostgreSQL (from the project root)
docker compose up -d db
#    and create the test database once (used only by the test suite)
docker compose exec db createdb -U app social_media_test

# 5. install, create the tables, create your first account, run
cd app
npm install
npm run db:migrate
npm run create-user -- --email you@example.com --name "Your Name" --role admin
npm run dev
```

Then open http://localhost:3000 and sign in. There is no public sign-up: accounts are created from the command line (below). The API keys are server-side only; users never see or enter them.

### Database and ports

PostgreSQL runs in Docker (`docker-compose.yml`) and is published on **host port 5435**, bound to 127.0.0.1. Port 5435 is used on purpose: 5432 is already taken by another container on the owner's machine. `.env.example` has the matching `DATABASE_URL` (the app) and `TEST_DATABASE_URL` (a separate `social_media_test` database used only by the test suite). If 5435 is busy on your machine, change the host port in `docker-compose.yml` and in both URLs in `.env`.

`db:migrate` and the account scripts load `DATABASE_URL` from the root `.env` themselves, so nothing needs to be exported in your shell.

### Commands (run from `app/`)

| Command | What it does |
|---|---|
| `docker compose up -d db` | start the local PostgreSQL (run from the project root) |
| `npm run db:migrate` | apply the SQL migrations in `app/drizzle` to `DATABASE_URL` |
| `npm run db:generate` | generate a new migration after changing `src/lib/db/schema.ts` |
| `npm run create-user -- --email <e> --name "<n>" --role admin\|user [--password <pw>]` | create an account (new non-admin accounts get a copy of the starter content) |
| `npm run reset-password -- --email <e> [--password <pw>]` | set a new password |
| `npm run disable-user -- --email <e>` | block login for the account (data is kept) |
| `npm run enable-user -- --email <e>` | allow login again |
| `npm run delete-user -- --email <e>` | delete the account and its data |
| `npm run migrate:csv -- --owner-email <e> [--data-dir <dir>]` | one-time import of the old `data/*.csv` into that account (reads the CSVs, never writes them) |
| `npm test` | run the test suite (`vitest run`; uses `TEST_DATABASE_URL`) |

Admins get an **Admin** page (`/admin`) to set each account's run and video quotas, deactivate accounts and act on other accounts' data; those actions are written to the `admin_audit` table. Admins have no quota themselves.

Each account can hold at most 50 creators, and "refresh" skips a creator whose stats were fetched less than 10 minutes ago, to keep Apify spend under control.

### Manual checklist (run by hand with two test accounts, A and B)

- [ ] A cannot see B's configs, creators or videos (and the other way round).
- [ ] The admin sees and edits the data of A and B from the admin panel, and each change shows up in `admin_audit`.
- [ ] A's run quota runs out and the screen says so.
- [ ] A deactivated account cannot log in.
- [ ] The image proxy refuses a domain that is not on the allowed list (only `*.cdninstagram.com` and `*.fbcdn.net` over https).

### The three keys

| Key | What it does | Where to get it | Cost |
|---|---|---|---|
| `APIFY_API_TOKEN` | scrapes competitors' Instagram videos | [apify.com](https://apify.com) → Settings → Integrations → Personal API token | free plan includes $5 of usage a month, which is plenty for a few dozen profiles |
| `GEMINI_API_KEY` | watches the videos and writes the breakdown | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | has a free tier, see the 429 note below |
| `ANTHROPIC_API_KEY` | generates the new concepts | [platform.claude.com](https://platform.claude.com) → API keys | pay per token, needs prepaid credit |

---

## Troubleshooting

These are the actual questions people asked under the video, with the actual answers.

### "There is no .env file in the folder"

Correct, and that is on purpose. `.env` is gitignored because it holds your private keys, and keys must never sit in a public repo. Copy the template instead:

```bash
cp .env.example .env          # macOS / Linux
Copy-Item .env.example .env   # Windows PowerShell
```

Then paste your keys after the `=` signs. No quotes, no spaces around the `=`. Keep `.env` at the **project root**, the same folder as this README, not inside `app/`. If you cannot see the file in VS Code, dotfiles are hidden in some setups: use the New File button and name it exactly `.env`.

### "zsh: command not found: claude" or "bash: claude: command not found"

Installing the **Claude Code extension in VS Code does not give you the `claude` terminal command.** The extension keeps its own private copy for its chat panel. To get the command you install Claude Code itself:

```bash
# macOS / Linux
curl -fsSL https://claude.ai/install.sh | bash

# Windows PowerShell
irm https://claude.ai/install.ps1 | iex
```

Then **close the terminal completely and open a new one**, and check:

```bash
claude --version
```

Still not found on macOS? Your PATH is missing the folder:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

`claude doctor` prints a full health report on your install if you are still stuck.

Note that Claude Code needs a **paid** Claude plan (Pro or higher) or an API account. The free claude.ai plan does not include it, so the command can install correctly and still refuse to sign you in.

### "cr: command not found" or "nothing happens when I type cr"

`cr` is not a Claude command, it is a shortcut defined in [shell-aliases.md](shell-aliases.md). Three things go wrong with it:

1. **It is lowercase.** Terminals are case sensitive, so `CR` is a different word and will never be found.
2. **A shortcut typed straight into a terminal dies when you close that window.** To keep it, put both lines in `~/.zshrc` (macOS) or `~/.bashrc` (Linux), then run `source ~/.zshrc`.
3. **On Windows, `alias` is not a command that defines anything.** In PowerShell `alias` means `Get-Alias`, which is why you get `ItemNotFoundException`. Use functions instead:

```powershell
function cs { claude "/prime" }
function cr { claude --dangerously-skip-permissions "/prime" }
```

To keep those permanently on Windows, run `notepad $PROFILE` and paste them in.

You never need the shortcut at all. Just run the command it stands for:

```bash
claude --dangerously-skip-permissions "/prime"
```

**What that flag does:** it turns off the "can I do this?" prompt, so Claude can edit files and run commands on this machine without asking each time. That is the whole reason it says "dangerously". Use it in a project folder like this one where you know what is inside, and drop the flag (`claude "/prime"`) any time you would rather approve each step.

### "Gemini error 429" / "does this need a paid Gemini plan?"

A 429 means you hit a quota on your Google AI key: requests per minute, tokens per minute, or requests per day. It is not a bug here, and **no, video analysis does not require a paid plan.** The claim going around that the paid tier has a $200 minimum is wrong: turning on billing is pay as you go.

Free ways to get under the limit:

- analyse fewer videos per run (lower "top k" and "max videos" on the run screen)
- wait and try again, the daily quota resets at midnight Pacific
- this project now backs off 2s, 4s, 8s between retries instead of a flat 5s, which clears most per-minute limits on its own

Check your own current limits at [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit). Google stopped publishing the free numbers in its docs, so that dashboard is the only accurate source.

One warning worth knowing: Google's pricing page says free tier content is used to improve their products. Do not push client material through a free key.

### "Gemini says the model does not exist (404)"

Google retires models. `gemini-2.0-flash`, which this project used to hardcode, was switched off and is no longer in the model list at all, which broke every run. It now defaults to `gemini-2.5-flash` and you can override it without touching code by setting `GEMINI_MODEL` in `.env`.

To see what your key can actually reach:

```bash
curl "https://generativelanguage.googleapis.com/v1/models?key=YOUR_KEY"
```

Put any name from that list into `GEMINI_MODEL`. `gemini-3.1-flash-lite` is cheaper per token.

### "Credit balance too low. Add funds"

That message is about the **Anthropic API**, which is prepaid pay per token, and is a completely separate bill from a Claude Pro or Max subscription. A subscription never funds an API key. Add credit at [platform.claude.com](https://platform.claude.com) → Billing, and switch on auto reload so a run cannot die halfway.

If you did not mean to use an API key at all, check whether one is set in your shell:

```bash
echo $ANTHROPIC_API_KEY     # macOS / Linux
```

A key set in your environment overrides your subscription login, so remove it and run `/login` inside Claude Code.

### "Will this get my Instagram banned?"

This project never touches your account. It reads **public** competitor videos through Apify and never logs in as you, never posts, never follows, never messages. The risk profile of automating your own logged-in account is a different thing entirely, and this is not that.

### "Apify says I exceeded the limit"

The free Apify plan gives $5 of usage a month and it does not roll over. Most social scrapers bill per result, so read the pricing line on the actor's own store page before a big run. A few dozen profiles costs cents.

---

## How it works

1. **Scrape** — pulls each competitor's recent videos via Apify
2. **Rank** — flags the outliers, the ones that beat that account's own average
3. **Watch** — uploads the top videos to Gemini, which describes what actually happens in them
4. **Generate** — Claude turns the patterns into new concepts written for your brand

Everything runs locally (the app, plus a PostgreSQL in Docker). `.env` never leaves your machine.

## Known issues

- **Intermittent vitest failure (open, cause not confirmed).** The full suite once finished with 141 of 153 tests passing instead of 153/153, and passed on the next run. A second occurrence (31 failed, 122 passed) happened on 2026-11-07 while another vitest process was starting against the same test database; the errors were `duplicate key ... users_email_unique (a@x.com)` and foreign-key violations on `user_id`, which is what two runs sharing one database look like. Suspected cause: concurrent runs (or leftover processes) sharing `TEST_DATABASE_URL`. The immediate re-run, with nothing else running, passed 153/153. If it happens, make sure no other `vitest` process is running, re-run once, and note the failing test names (seen so far: `pipeline/runs.test.ts`, `quota.test.ts`, `api/pipeline/route.test.ts`, `admin.test.ts`, `auth-routes.test.ts`, `starter.test.ts`, `isolation.test.ts`, `account.test.ts`). The tests were deliberately not changed to hide it.
- **vitest does not read `.env`.** Export `TEST_DATABASE_URL` in the shell before `npx vitest run`, otherwise every database test fails with "DATABASE_URL is not set".

## Security notes and deferred items (for the VPS stage)

The app is built for local use. These are known and accepted for now, and must be handled before putting it on a server:

- **R1.** The pipeline video download accepts any host returned by Apify and follows default redirects.
- **R2.** Neither the image proxy nor the pipeline video download caps the response size.
- **R3.** DNS rebinding, or an allowed hostname that resolves to a private IP, is out of scope for the local build (the proxy checks the hostname only).
- An admin can deactivate another admin: there is no "last active admin" guard.
- A run's quota is not refunded when individual videos fail.
- The `limitedTo` SSE event is not the first event of the pipeline stream.

## Project layout

```
.env.example        the template for your keys and database URLs
docker-compose.yml  local PostgreSQL (host port 5435)
app/                the Next.js app you actually use
  drizzle/            SQL migrations
  src/lib/apify.ts    scraping
  src/lib/gemini.ts   video analysis
  src/lib/claude.ts   concept generation
  src/lib/{db,auth,repo,quota,pipeline,accounts,api,client}   database, login, per-account data access, quotas, runs, starter copy, route and client helpers
  src/scripts/        account commands and CSV migration
data/               the old CSV data (only read by migrate:csv)
CLAUDE.md           context Claude Code loads to work on this project
shell-aliases.md    the cs / cr shortcuts explained
```

---

Built by [Oleg Melnikov](https://oleg.ae). More free guides and tools: [oleg.ae](https://oleg.ae)
