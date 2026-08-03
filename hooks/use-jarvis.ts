"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import type { JarvisReply } from "@/types/api";

export interface JarvisWireMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * One conversational turn.
 *
 * No toasts: an error belongs in the conversation, where it stays readable and
 * next to the message that caused it, rather than in a notification that
 * disappears before it has been understood.
 */
export function useSendToJarvis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messages: JarvisWireMessage[]) =>
      api.post<JarvisReply>("/api/jarvis", { messages }),

    onSuccess: (result) => {
      // Only when something actually changed — asking "what's left?" should
      // not trigger a refetch storm.
      if (!result.actions.some((action) => action.mutating)) return;

      // Broad on purpose: one reply can log a meal, log a workout and change
      // the day type, and working out which caches each combination touched
      // would be more code than it saves.
      for (const key of ["dashboard", "meals", "exercise", "routines"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
