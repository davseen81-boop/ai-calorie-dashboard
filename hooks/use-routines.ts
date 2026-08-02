"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiRequestError } from "@/lib/api/client";
import type { ApiRoutine, MealType } from "@/types/api";

export const routineKeys = {
  all: ["routines"] as const,
};

export interface RoutineMealPayload {
  name: string;
  mealType: MealType;
  timeOfDay?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }>;
}

export interface SchedulePayload {
  enabled: boolean;
  /** ISO weekdays, 1 = Monday. */
  daysOfWeek: number[];
  timeOfDay: string;
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: routineKeys.all });
  // Applying a routine writes real meals, so the dashboard is stale too.
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["meals"] });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiRequestError ? error.message : fallback;
}

export function useRoutines() {
  return useQuery({
    queryKey: routineKeys.all,
    queryFn: () =>
      api.get<{ routines: ApiRoutine[] }>("/api/routines").then((r) => r.routines),
  });
}

export function useCreateRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      kind: "meal" | "day";
      isFavorite?: boolean;
      meals: RoutineMealPayload[];
      schedule?: SchedulePayload | null;
    }) => api.post<ApiRoutine>("/api/routines", payload),
    onSuccess: (routine) => {
      toast.success(`Saved "${routine.name}"`, {
        description: "Find it under Repeat when logging a meal.",
      });
      invalidateAll(queryClient);
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not save that routine.")),
  });
}

export function useUpdateRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Record<string, unknown>) =>
      api.patch<ApiRoutine>(`/api/routines/${id}`, patch),
    onSuccess: () => invalidateAll(queryClient),
    onError: (error) =>
      toast.error(errorMessage(error, "Could not update that routine.")),
  });
}

export function useDeleteRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/api/routines/${id}`),
    onSuccess: () => {
      toast.success("Routine deleted", {
        description: "Meals already logged from it are untouched.",
      });
      invalidateAll(queryClient);
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not delete that routine.")),
  });
}

/** Log a routine's meals right now. */
export function useApplyRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ routine: ApiRoutine; mealCount: number }>(
        `/api/routines/${id}/apply`,
        {},
      ),
    onSuccess: ({ routine, mealCount }) => {
      toast.success(`${routine.name} logged`, {
        description:
          mealCount === 1
            ? "Added to today."
            : `${mealCount} meals added to today.`,
      });
      invalidateAll(queryClient);
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not log that routine.")),
  });
}
