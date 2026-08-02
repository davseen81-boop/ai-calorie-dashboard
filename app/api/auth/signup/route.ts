import { NextRequest } from "next/server";

import { fail, handleRouteError, ok } from "@/lib/api/response";
import { setSessionCookie } from "@/lib/auth/session";
import { InvalidInviteError, checkInviteCode } from "@/lib/auth/invite";
import { EmailTakenError, createUser } from "@/lib/db/users";
import { signupSchema } from "@/lib/validation/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/signup — create an account and sign in. */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const input = signupSchema.parse(body);

    // Checked before anything is written, so a wrong code can't leave a
    // half-created account behind.
    if (!checkInviteCode(input.inviteCode)) {
      return fail("bad_request", new InvalidInviteError().message, 403);
    }

    const user = await createUser(input);
    await setSessionCookie({ userId: user.id, email: user.email });

    return ok(
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return fail("bad_request", error.message, 409);
    }
    return handleRouteError(error);
  }
}
