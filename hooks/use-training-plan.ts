"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiRequestError } from "@/lib/api/client";
import type { TrainingPlan } from "@/types/api";

export const trainingPlanKey = ["training-plan"] as const;

export function useTrainingPlan() {
  return useQuery({
    queryKey: trainingPlanKey,
    queryFn: () => api.get<TrainingPlan>("/api/training-plan"),
  });
}

export interface NewTrainingSession {
  name: string;
  activityKey: string | null;
  durationMinutes: number;
  daysOfWeek: number[];
}

/**
 * Both mutations replace the cached plan with the server's response rather
 * than invalidating: every figure on the card is derived from the whole plan,
 * so a partial update would show a stale weekly total next to a fresh session
 * list.
 *
 * The dashboard is invalidated too — the plan decides which days default to
 * training, so today's target can change from here.
 */
function usePlanMutationHandlers() {
  const queryClient = useQueryClient();

  return {
    onSuccess: (plan: TrainingPlan) => {
      queryClient.setQueryData(trainingPlanKey, plan);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ApiRequestError
          ? error.message
          : "Could not update your training plan.",
      ),
  };
}

export function useAddTrainingSession() {
  const handlers = usePlanMutationHandlers();

  return useMutation({
    mutationFn: (session: NewTrainingSession) =>
      api.post<TrainingPlan>("/api/training-plan", session),
    ...handlers,
  });
}

export function useRemoveTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/api/training-plan/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlanKey });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiRequestError ? error.message : "Could not remove that.",
      ),
  });
}
