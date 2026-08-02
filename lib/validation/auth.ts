import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email.")
  .max(254)
  .email("That doesn't look like an email address.");

/**
 * A length floor and nothing else.
 *
 * Composition rules (a digit, a symbol…) push people towards predictable
 * substitutions and away from long passphrases, which are stronger. Length is
 * the property that actually matters.
 */
const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200, "That's longer than 200 characters.");

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().max(80).optional(),
  /** Only checked when SIGNUP_INVITE_CODE is set on the server. */
  inviteCode: z.string().trim().max(200).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  // Not length-checked: an old account may predate any rule, and rejecting a
  // correct password on format would be absurd.
  password: z.string().min(1, "Enter your password."),
});
