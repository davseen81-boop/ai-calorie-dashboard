import { z } from "zod";

/**
 * POST /api/jarvis
 *
 * The whole conversation is sent each time — nothing is stored server-side, so
 * a chat leaves no record beyond the meals it logged. The caps are what keeps
 * that affordable: an unbounded transcript would be re-billed on every turn.
 */
export const jarvisRequestSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z
            .string()
            .trim()
            .min(1, "Say something first.")
            .max(2000, "That message is too long."),
        }),
      )
      .min(1, "Send at least one message.")
      .max(40, "This conversation is too long — start a new one."),
  })
  .refine((v) => v.messages[v.messages.length - 1]?.role === "user", {
    path: ["messages"],
    message: "The last message must be the user's.",
  });

export type JarvisRequest = z.infer<typeof jarvisRequestSchema>;
