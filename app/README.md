# Social Media AI (app)

Next.js 16 (App Router) app with PostgreSQL (Drizzle ORM) and per-account login.

Setup, environment variables, database port (5435), account and migration commands, the manual checklist and known issues are in the root [README.md](../README.md).

Quick start from this folder (after `docker compose up -d db` at the project root and a root `.env`):

```bash
npm install
npm run db:migrate
npm run create-user -- --email you@example.com --name "You" --role admin
npm run dev
```

Tests: `npx vitest run` (uses `TEST_DATABASE_URL`). Lint: `npm run lint`. Build: `npm run build`.
