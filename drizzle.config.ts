import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so it does not pick up `.env.local`
// automatically the way the dev server does.
config({ path: ".env.local" });

const url = process.env.DATABASE_URL ?? "file:./local.db";
const isTurso = !url.startsWith("file:");

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  // Both dialects speak SQLite; `turso` additionally sends the auth token.
  dialect: isTurso ? "turso" : "sqlite",
  dbCredentials: isTurso
    ? { url, authToken: process.env.DATABASE_AUTH_TOKEN }
    : { url },
  strict: true,
  verbose: true,
} satisfies Config;
