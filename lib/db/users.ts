import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "./index";
import {
  DEFAULT_USER_ID,
  meals,
  profiles,
  routineSchedules,
  routines,
  users,
  type UserRow,
} from "./schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/** Emails are matched case-insensitively, so they're stored normalised. */
function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const row = await db.query.users.findFirst({
    where: eq(users.email, normaliseEmail(email)),
  });
  return row ?? null;
}

export async function countUsers(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(users);
  return row?.n ?? 0;
}

export class EmailTakenError extends Error {
  constructor() {
    super("An account with that email already exists.");
    this.name = "EmailTakenError";
  }
}

/**
 * Create an account.
 *
 * The very first account adopts any data created before accounts existed, so
 * an install that has been used single-user keeps its meals, routines and
 * goals rather than stranding them behind the new login.
 */
export async function createUser(input: {
  email: string;
  password: string;
  displayName?: string | null;
}): Promise<UserRow> {
  const email = normaliseEmail(input.email);

  if (await findUserByEmail(email)) throw new EmailTakenError();

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  const isFirstUser = (await countUsers()) === 0;

  await db.insert(users).values({
    id,
    email,
    passwordHash,
    displayName: input.displayName?.trim() || null,
  });

  if (isFirstUser) {
    await adoptLegacyData(id);
  } else {
    // Everyone else starts clean; the profile row is created on first read.
    await db
      .insert(profiles)
      .values({ id, displayName: input.displayName?.trim() || null })
      .onConflictDoNothing();
  }

  const created = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!created) throw new Error("User vanished immediately after creation");
  return created;
}

/**
 * Reassign pre-accounts data to the first real account.
 *
 * `meal_items` carries no user id (it's scoped through its meal), so only the
 * tables that do need rewriting.
 */
async function adoptLegacyData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(meals)
      .set({ userId })
      .where(eq(meals.userId, DEFAULT_USER_ID));
    await tx
      .update(routines)
      .set({ userId })
      .where(eq(routines.userId, DEFAULT_USER_ID));
    await tx
      .update(routineSchedules)
      .set({ userId })
      .where(eq(routineSchedules.userId, DEFAULT_USER_ID));

    // The legacy profile becomes this user's profile, goals and all.
    const legacy = await tx.query.profiles.findFirst({
      where: eq(profiles.id, DEFAULT_USER_ID),
    });

    if (legacy) {
      await tx
        .insert(profiles)
        .values({ ...legacy, id: userId })
        .onConflictDoNothing();
      await tx.delete(profiles).where(eq(profiles.id, DEFAULT_USER_ID));
    }
  });
}

/**
 * Check an email and password.
 *
 * Returns null for both "no such account" and "wrong password" — telling them
 * apart would let anyone enumerate which emails are registered.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<UserRow | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? user : null;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const row = await db.query.users.findFirst({ where: eq(users.id, id) });
  return row ?? null;
}
