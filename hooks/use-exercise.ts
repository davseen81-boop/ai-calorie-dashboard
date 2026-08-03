"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiRequestError } from "@/lib/api/client";
import type { ApiExerciseEntry } from "@/types/api";

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  // Exercise moves the calorie target, so the dashboard is stale too.
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["exercise"] });
}

export interface LogExercisePayload {
  activityKey?: string | null;
  name?: string;
  durationMinutes: number;
  caloriesBurned?: number;
  notes?: string | null;
}

export function useLogExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LogExercisePayload) =>
      api.post<ApiExerciseEntry & { usedAssumedWeight: boolean }>(
        "/api/exercise",
        payload,
      ),
    onSuccess: (entry) => {
      toast.success(`${entry.name} logged`, {
        description: entry.usedAssumedWeight
          ? `About ${Math.round(entry.caloriesBurned)} kcal — add your weight in Settings for a closer estimate.`
          : `About ${Math.round(entry.caloriesBurned)} kcal burned.`,
      });
      invalidate(queryClient);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiRequestError
          ? error.message
          : "Could not log that exercise.",
      ),
  });
}

export function useDeleteExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ id: string }>(`/api/exercise/${id}`),
    onSuccess: () => {
      toast.success("Exercise removed");
      invalidate(queryClient);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiRequestError ? error.message : "Could not remove it.",
      ),
  });
}
