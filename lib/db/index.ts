import "server-only";

import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { dbEnv } from "@/lib/env-server";
import * as schema from "./schema";

/**
 * Database handle.
 *
 * Same code local and deployed — only DATABASE_URL changes:
 *   local   file:./local.db
 *   Vercel  libsql://<db>-<org>.turso.io  (+ DATABASE_AUTH_TOKEN)
 */

// Next.js dev server re-evaluates modules on every HMR pass. Without caching on
// globalThis each reload would open another connection and, against a local
// file, eventually exhaust handles.
const globalForDb = globalThis as unknown as { __libsqlClient?: Client };

function getClient(): Client {
  if (globalForDb.__libsqlClient) return globalForDb.__libsqlClient;

  const url = dbEnv.DATABASE_URL;
  const client = createClient({
    url,
    // Turso requires a token; a local file must not be given one.
    authToken: url.startsWith("file:")
      ? undefined
      : dbEnv.DATABASE_AUTH_TOKEN,
  });

  // SQLite ignores foreign keys unless explicitly enabled, which would silently
  // orphan meal_items when their meal is deleted. Turso enables this by
  // default; a local file does not.
  if (url.startsWith("file:")) {
    void client.execute("PRAGMA foreign_keys = ON");
  }

  globalForDb.__libsqlClient = client;
  return client;
}

export const db = drizzle(getClient(), { schema });

export type Db = typeof db;
export { schema };
