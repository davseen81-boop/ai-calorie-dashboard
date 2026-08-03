# Energy Arc

*A minimalist approach to progress tracking.*

Log meals by description, photo or conversation; an AI estimates the nutrition,
and the day is tracked against calorie and macro targets that move with rest and
active days.

Multi-user, with email/password and optional Google sign-in behind an invite
code. Every row is scoped by `userId`.

**Jarvis** is the built-in assistant: it logs meals and workouts by tool
calling through the same data layer the UI uses, so nothing it writes is a
special case.

## Stack

| | |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript (strict) |
| UI | Tailwind CSS v3, shadcn/ui, Recharts, lucide-react |
| Data | SQLite via libSQL + Drizzle ORM |
| AI | Google Gemini (free tier) or Anthropic Claude — one env var switches |
| State | TanStack Query v5 |

## Setup

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env.local
```

`GEMINI_API_KEY` is the only value you must supply for AI analysis — it's free
and needs no card: [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
`DATABASE_URL` already defaults to a local SQLite file.

### Switching AI provider

Set `AI_PROVIDER` to `gemini` (default) or `anthropic`; only that provider's
key is required. Prompts, schema validation and error handling are shared, so
switching is one env var rather than a code change.

| | Gemini | Claude |
|---|---|---|
| Cost | Free tier, no card | Prepaid credits (~$0.01–0.05 per meal) |
| Photos | ✅ | ✅ |
| Privacy | Free tier may use your data for training | Not used for training |

Note a Claude.ai subscription does **not** include API access — that's billed
separately at [console.anthropic.com](https://console.anthropic.com).

Create the database:

```bash
npm run db:migrate
```

Run it:

```bash
npm run dev
```

Everything except meal analysis works without an API key; the Log Meal sheet
will show a clear "not configured" message until you add one.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Browse the database |

## Deploying to Vercel

**A SQLite file will not work on Vercel.** Serverless storage is ephemeral, so
writes are lost on every cold start and each instance gets its own copy. Use
[Turso](https://turso.tech) instead — it is the same SQLite engine reachable
over HTTP, so no code changes are needed.

### 1. Create the database

> **On Windows, use the web dashboard.** The Turso CLI runs under WSL only, so
> the commands in Turso's own quickstart will not work in PowerShell.

At [app.turso.tech](https://app.turso.tech):

1. Create a database (any name, e.g. `calorie-dashboard`)
2. Copy its **URL** — it looks like `libsql://calorie-dashboard-<org>.turso.io`
3. Create a **token** for it and copy that too

On macOS or Linux the CLI equivalents are `turso db create calorie-dashboard`
and `turso db tokens create calorie-dashboard`.

### 2. Create the tables

Point your local `.env.local` at the remote database and push the schema —
this uses the libSQL HTTP client, so no Turso CLI is involved:

```bash
npm run db:push
```

Then set `DATABASE_URL` back to `file:./local.db` if you want to keep
developing against the local file.

### 3. Configure Vercel

Add three environment variables in the Vercel project settings:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the `libsql://…turso.io` URL |
| `DATABASE_AUTH_TOKEN` | the token from step 1 |
| `ANTHROPIC_API_KEY` | your Anthropic key |

Both `drizzle.config.ts` and `lib/db/index.ts` switch on the URL scheme, so
local and production run identical code.

## Project layout

```
app/
  (app)/            dashboard, history, settings — share the app shell
  api/              meals CRUD, analyze, dashboard summaries, profile
components/
  dashboard/        ring, macro donut, weekly chart, summary cards
  meals/            log sheet, item editor, timeline, edit dialog
  ui/               shadcn/ui primitives
lib/
  ai/               prompts, schemas, Claude client
  db/               schema, queries, dashboard aggregates
  validation/       Zod request schemas
```

## A note on the design

This was built from an 8-phase brief rather than the original project plan,
which was not reachable from this machine. Every gap-filling decision is
recorded in [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md), with ⚠️ marking the
ones most likely to diverge from the intended spec — check those first.
