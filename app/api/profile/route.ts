import { NextRequest } from "next/server";

import { handleRouteError, ok } from "@/lib/api/response";
import { getOrCreateProfile, updateProfile } from "@/lib/db/queries";
import { updateProfileSchema } from "@/lib/validation/profile";
import type { ApiProfile } from "@/types/api";
import type { ProfileRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** GET /api/profile — settings and daily goals, created on first access. */
export async function GET() {
  try {
    return ok(serialize(await getOrCreateProfile()));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PATCH /api/profile — partial update from the settings page. */
export async function PATCH(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const input = updateProfileSchema.parse(body);

    const { dietaryPreferences, ...rest } = input;

    // Built explicitly rather than by conditional spread: spreading a
    // maybe-present key of a different type widens it to `string & string[]`.
    const patch: Parameters<typeof updateProfile>[0] = { ...rest };
    if (dietaryPreferences) {
      // SQLite has no array type; the column holds a JSON string.
      patch.dietaryPreferences = JSON.stringify(dietaryPreferences);
    }

    const updated = await updateProfile(patch);

    return ok(serialize(updated));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Decode the stored JSON string so the client always sees a real array. */
function serialize(profile: ProfileRow): ApiProfile {
  let preferences: string[] = [];
  try {
    const parsed: unknown = JSON.parse(profile.dietaryPreferences);
    if (Array.isArray(parsed)) {
      preferences = parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // A malformed value shouldn't break the settings page — treat as empty.
  }

  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    dietaryPreferences: preferences,
  };
}
