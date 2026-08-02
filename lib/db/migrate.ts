/**
 * Applies pending migrations from ./drizzle.
 *
 * Run with `npm run db:migrate`. Safe to re-run — Drizzle tracks which
 * migrations have already been applied in its own bookkeeping table.
 */
import { config } from "dotenv";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./local.db";
  const client = createClient({
    url,
    authToken: url.startsWith("file:")
      ? undefined
      : process.env.DATABASE_AUTH_TOKEN,
  });

  if (url.startsWith("file:")) {
    await client.execute("PRAGMA foreign_keys = ON");
  }

  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log(`Migrations applied to ${url}`);
  client.close();
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
