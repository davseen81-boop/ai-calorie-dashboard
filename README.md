# AI Calorie Dashboard

Log meals by description or photo, let Claude estimate the nutrition, and track
calories and macros against daily goals.

Single-user by design — there is no login. Every row carries a `userId`
(defaulted to `local-user`) so authentication can be added later without
reshaping the data.

## Stack

| | |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript (strict) |
| UI | Tailwind CSS v3, shadcn/ui, Recharts, lucide-react |
| Data | SQLite via libSQL + Drizzle ORM |
| AI | Anthropic Claude (`claude-opus-5`), text + vision |
| State | TanStack Query v5 |

## Setup

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env.local
```

`ANTHROPIC_API_KEY` is the only value you must supply for AI analysis — get one
from [console.anthropic.com](https://console.anthropic.com/settings/keys).
`DATABASE_URL` already defaults to a local SQLite file.

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

```bash
turso db create calorie-dashboard
```

```bash
turso db tokens create calorie-dashboard
```

Set these in Vercel's environment settings, then run `npm run db:push` against
the remote database once before deploying:

- `DATABASE_URL` — the `libsql://…turso.io` URL
- `DATABASE_AUTH_TOKEN` — the token from the command above
- `ANTHROPIC_API_KEY`

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
