"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api/client";

/**
 * Applies any scheduled routine whose time has passed.
 *
 * Runs on app load rather than from a timer, which means a routine is never
 * logged before its time has actually arrived — and a day you never opened the
 * app simply isn't back-filled, rather than inventing meals you may not have
 * eaten. The endpoint is idempotent, so re-running is harmless.
 */
export function RoutineRunner() {
  const queryClient = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        const result = await api.post<{
          applied: Array<{ routineId: string; name: string }>;
        }>("/api/routines/run-due", {});

        if (result.applied.length === 0) return;

        toast.info(
          result.applied.length === 1
            ? `${result.applied[0].name} logged automatically`
            : `${result.applied.length} scheduled routines logged`,
          { description: "From your schedule. Edit or delete them as usual." },
        );

        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["meals"] });
      } catch {
        // A failed catch-up is not actionable by the user and must never block
        // the app — the next load simply tries again.
      }
    })();
  }, [queryClient]);

  return null;
}
