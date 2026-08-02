# Assumptions log

The original project plan (`/mnt/agents/output/AI_Calorie_Dashboard_Project_Plan.md`)
was not reachable from this machine — that is a Linux path from a different
environment, and no copy exists on this filesystem. Every decision below was
therefore made from the 8-phase brief rather than read from the plan.

**Reconcile this list against the real plan before treating the build as final.**
Items marked ⚠️ are the ones most likely to contradict it.

## Stack change — no Supabase, no auth

The brief specified Supabase + auth. The user subsequently chose to drop both:

- **Database:** libSQL/SQLite via Drizzle ORM, replacing Supabase Postgres.
- **Auth:** none — single-user build. Phase 4 (login, signup, session provider,
  protected middleware) is **not being built**.

Consequences worth understanding:

| Lost with Supabase | Replacement |
|---|---|
| Row Level Security | Ownership is enforced in application code. `lib/db/queries.ts` scopes every read and write by `userId`; nothing else may touch `db` directly. The database no longer catches a missed filter — that is now a code-review concern. |
| Postgres triggers (totals, profile provisioning, ownership) | Plain TypeScript in `lib/db/queries.ts`: `recalcMealTotals()` runs inside the same transaction as any item mutation, and `getOrCreateProfile()` provisions lazily on first read. |
| Postgres enums | `text({ enum: [...] })` — TS union at compile time, plain TEXT in the database. |
| Hosted database | A local `local.db` file. **A SQLite file cannot be used on Vercel** — serverless storage is ephemeral, so writes are lost on cold start. Deployment requires Turso (same engine over HTTP); only `DATABASE_URL` + `DATABASE_AUTH_TOKEN` change. |

## Phase 1 — Setup

| # | Decision | Rationale |
|---|---|---|
| A1 | App Router, **no** `src/` directory | The brief lists `app/`, `components/`, `lib/`, `types/`, `hooks/` at the root. |
| A2 | Next.js **14.2.35**, React 18, Tailwind **v3.4** | "Next.js 14" was specified; Tailwind v3 is what Next 14 ships and what shadcn/ui targets. |
| A3 | npm package name `ai-calorie-dashboard` | `AI Calories Calculator` is not a legal npm package name, so the project was scaffolded under a valid name and moved into place. |
| A4 | Import alias `@/*` → project root | create-next-app default; shadcn/ui aliases assume it. |
| A5 | shadcn/ui configured **manually** rather than via `shadcn init` | Avoids the CLI rewriting `globals.css` and discarding the custom theme tokens. |
| A6 | shadcn style `new-york`; `baseColor` **slate** | `violet` is a shadcn *theme*, not a valid `baseColor` — the registry only serves gray/neutral/slate/stone/zinc. The purple palette is hand-written in `globals.css` instead. |
| A7 | `tailwind-merge` pinned to **v2** | v3 targets Tailwind v4; on v3 it mis-resolves some conflicting utilities. |
| A8 ⚠️ | Macro colours: protein = violet, carbs = sky, fat = amber | The plan may specify its own. Defined once as `--protein` / `--carbs` / `--fat` so one edit re-themes every chart and badge. |
| A9 ⚠️ | Gradient `135deg`, violet `262° 83% 58%` → purple `291° 80% 62%` | "Purple gradient theme" was described but not specified numerically. Exposed as `--gradient-from` / `--gradient-to`. |
| A10 | Env vars: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, `OPENAI_VISION_MODEL`, `NEXT_PUBLIC_SITE_URL` | Model IDs are env-driven so they can be changed without a code edit. |

## Phase 2 — Database (SQLite / Drizzle)

| # | Decision | Rationale |
|---|---|---|
| B1 ⚠️ | Column names as in `lib/db/schema.ts` — `dailyCalorieGoal`, `totalCalories`, `proteinG`… | Invented. The single most likely divergence from the plan. |
| B2 ⚠️ | Macro totals **denormalised onto `meals`**, recomputed by `recalcMealTotals()` | Every dashboard query sums over meals; recomputing via join+aggregate per request is wasteful. If the plan sums from items instead, drop the four `total_*` columns and the helper. |
| B3 | Timestamps stored as **unix milliseconds** (INTEGER), not ISO text | Range filters and `ORDER BY` stay numeric rather than lexicographic. |
| B4 | IDs are app-generated UUIDs (`crypto.randomUUID()`) | SQLite has no `gen_random_uuid()`. |
| B5 | `dietaryPreferences` stored as a JSON string | SQLite has no array type. |
| B6 | `profiles.timezone` (IANA) per user | "Today" must be bucketed in the user's zone, or a late-night meal lands on the wrong day. |
| B7 | `meals.userId` retained, defaulting to `DEFAULT_USER_ID` | Costs nothing now and means adding login later does not require reshaping the data. |
| B8 | `PRAGMA foreign_keys = ON` set explicitly for local files | SQLite ignores foreign keys by default, which would orphan `meal_items` on meal deletion. Turso enables it already. |
| B9 | Env validated with Zod, **lazily** (Proxy on first access) | Import-time validation would break `next build` on a machine without `.env.local`. Secrets isolated behind `server-only`. |
| B10 | libSQL client cached on `globalThis` | Next.js re-evaluates modules on every HMR pass; without this, each reload opens another connection. |

## Phase 3 — AI backend & API

| # | Decision | Rationale |
|---|---|---|
| C1 ⚠️ | Response envelope is `{ data }` / `{ error: { code, message, details? } }` | Invented — the plan may specify a bare object. One shape means the client branches in a single place. |
| C2 ⚠️ | AI prompts in `lib/ai/prompts.ts` are written from scratch | The plan's "exact prompts" were unavailable. Text and photo modes share a base ruleset so the same meal scores comparably however it was logged. |
| C3 | Model returns snake_case; routes map to camelCase at the boundary | Keeps one naming convention inside the app. |
| C4 | **OpenAI Structured Outputs** (`json_schema`, `strict: true`) **and** Zod validation | Structured Outputs guarantee shape, not sense — a model can still return a negative calorie count or confidence of 7. Zod rejects those. The JSON Schema is hand-written rather than generated from Zod to avoid coupling to a zod major version. |
| C5 | `is_food: false` is a *successful* model call mapped to a 422 | Distinguishes "photo of a car" from "the model broke", so the UI can say something useful. |
| C6 | Photos discarded after analysis; no `imageUrl` written | User's explicit choice. Avoids Vercel Blob and the ephemeral-filesystem problem. The column remains in the schema, unused. |
| C7 | Env split into `dbEnv` and `aiEnv`, validated independently | A single schema made `/api/meals` fail to build without an OpenAI key, because `next build` evaluates every route's module scope. Caught by the build. |
| C8 | Missing `OPENAI_API_KEY` → 503 `ai_not_configured`, not 500 | The request was fine; the service is not configured. The message names the fix. |
| C9 | Totals rounded to 1dp where derived | Summing REALs yields artefacts (`5.6000000000000005`) that compound as meal totals are themselves summed for the dashboard. |
| C10 | Client-supplied totals are ignored; always re-derived from items | A tampered or stale total cannot disagree with the rows it summarises. |
| C11 | `PATCH` with `items` replaces the list wholesale | The edit UI returns the full corrected list; diffing per row adds failure modes for no visible gain. |
| C12 | Weekly summary runs one aggregate query per day | A single `GROUP BY` cannot bucket by the user's timezone, and DST-shifted boundaries must stay exact. At 7 days against SQLite the cost is negligible. |
| C13 | `averageCalories` divides by days *logged*, not days elapsed | Otherwise a day the user forgot to log drags the average toward zero. |
| C14 | LIKE wildcards escaped in search, with explicit `ESCAPE '\'` | Searching "100%" would otherwise match every row. |
| C15 | `maxDuration = 60` on the analyze route | Vision calls routinely take 15–30s; the platform default would cut them off. |

## Phase 3 addendum — Claude instead of OpenAI

The user switched the AI provider after Phase 3 was built and verified.

| # | Decision | Rationale |
|---|---|---|
| C16 | **Anthropic Claude** (`claude-opus-5`) replaces GPT-4o; `@anthropic-ai/sdk` replaces `openai` | User's choice. The prompts, Zod validation, route handlers and error envelope were provider-neutral and carried over unchanged. |
| C17 | **One** model env var (`ANTHROPIC_MODEL`) instead of separate text/vision models | Claude is natively multimodal — there is no separate vision model to configure. |
| C18 | Structured output via `output_config.format` with a hand-written JSON Schema | Same belt-and-braces as before: the schema guarantees shape, Zod re-checks values. Hand-written to avoid coupling to a zod-to-json-schema converter. Note Claude rejects `minimum`/`maxLength` style constraints in this schema — all range checking lives in Zod. |
| C19 | Effort `low` for text, `medium` for photo; thinking left **on** (the default) | Both are scoped extraction tasks and Claude Opus 5 performs strongly at low effort. Disabling thinking is the more expensive lever on this model and has known failure modes, so low effort is the cost control instead. |
| C20 | `stop_reason: "refusal"` mapped to a 422 `ai_refused` | Safety classifiers return a normal HTTP 200, so an unchecked `content[0]` read would crash. Vanishingly unlikely for food, but cheap to handle. |
| C21 | Server-side `fallbacks` **not** enabled | Anthropic recommends it by default for Opus 5, but its purpose is recovering from cyber/bio classifier refusals, which meal analysis cannot trigger. Skipped to avoid a beta endpoint dependency; add `fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta if you ever widen the prompt's scope. |

## Phases 5–8 — Frontend

Phase 4 (auth) was **not built** — the user chose a single-user app.

| # | Decision | Rationale |
|---|---|---|
| D1 | React Query client created in `useState`, not at module scope | A module-level client is shared across requests during SSR and would leak one user's cache into another. |
| D2 | Queries don't retry on 4xx | Retrying a validation error or a 404 just repeats the failure; only 5xx and network errors get a second attempt. |
| D3 | Macro donut slices sized by **calorie** contribution, labelled in grams | 10g of fat and 10g of carbs look equal by weight but contribute very differently to the day's energy; a gram-weighted donut would misrepresent the split. |
| D4 | Days with no meals render as empty bars, not zero-height ones | A zero bar implies a fasted day rather than a day the user forgot to log. |
| D5 | Calorie ring arc caps at 100%, numeric readout doesn't | A wrapping arc reads as "nearly done" when the user is actually over. |
| D6 | Delete is optimistic with a captured rollback; edit is not | Delete is instant and its failure is easy to reverse. An edit's result depends on server-derived totals, so showing it optimistically could display figures the server never agreed with. |
| D7 | `PATCH` sends the whole item list rather than a diff | Matches the server contract (items are replaced wholesale) and avoids reconciling per-row for no visible gain. |
| D8 | History search debounced 300ms | Per-keystroke requests would flicker as out-of-order responses landed. |
| D9 | Settings form seeds once, guarded by a `loaded` flag | Otherwise a background refetch would overwrite edits the user is midway through. |
| D10 ⚠️ | `profiles.theme` is stored but **not applied on load** — next-themes reads localStorage | Fine for a single-user, single-device app. On a new device the stored preference is ignored and `system` wins. Wire the profile value into `ThemeProvider`'s `defaultTheme` if that ever matters. |
| D11 | `tsconfig` target set to `ES2017` | Absent a target, `tsc` assumes ES5 and rejects iterating a `Map`. Next transpiles independently of this setting. |
| D12 | `react-day-picker` ended up on **v10**, not the v9 pin | The shadcn CLI upgraded it when adding the Calendar component. The v10 API drops `initialFocus` in favour of `autoFocus`. |

## Open questions

- Nothing outstanding beyond the ⚠️ items above.
