import { NextRequest } from "next/server";

import { fail, handleRouteError, ok } from "@/lib/api/response";
import { setSessionCookie } from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/db/users";
import { loginSchema } from "@/lib/validation/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/login */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const input = loginSchema.parse(body);

    const user = await verifyCredentials(input.email, input.password);
    if (!user) {
      // One message for both "no such account" and "wrong password", so the
      // response can't be used to discover which emails are registered.
      return fail("unauthorized", "Email or password is incorrect.", 401);
    }

    await setSessionCookie({ userId: user.id, email: user.email });

    return ok({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
