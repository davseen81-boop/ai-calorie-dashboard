"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiRequestError } from "@/lib/api/client";
import type {
  AnalyzeResponse,
  ApiMeal,
  ApiProfile,
  MealListResponse,
  MealType,
  TodaySummary,
  WeeklySummary,
} from "@/types/api";

/**
 * Query keys.
 *
 * Centralised so an invalidation can't silently miss a cache entry by
 * misspelling a key — a class of bug that shows up as "the dashboard didn't
 * refresh" rather than as an error.
 */
export const queryKeys = {
  today: ["dashboard", "today"] as const,
  weekly: (days: number) => ["dashboard", "weekly", days] as const,
  meals: (filters: MealFilters) => ["meals", filters] as const,
  profile: ["profile"] as const,
};

export interface MealFilters {
  search?: string;
  mealType?: MealType;
  from?: string;
  to?: string;
}

/** Every list and summary that a meal mutation can invalidate. */
function invalidateMealData(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["meals"] });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useTodaySummary() {
  return useQuery({
    queryKey: queryKeys.today,
    queryFn: () => api.get<TodaySummary>("/api/dashboard/today"),
  });
}

export function useWeeklySummary(days = 7) {
  return useQuery({
    queryKey: queryKeys.weekly(days),
    queryFn: () => api.get<WeeklySummary>(`/api/dashboard/weekly?days=${days}`),
  });
}

export function useMeals(filters: MealFilters) {
  return useQuery({
    queryKey: queryKeys.meals(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.mealType) params.set("mealType", filters.mealType);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      return api.get<MealListResponse>(`/api/meals?${params.toString()}`);
    },
  });
}

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => api.get<ApiProfile>("/api/profile"),
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type AnalyzePayload =
  | { mode: "text"; description: string; mealTypeHint?: MealType }
  | { mode: "photo"; image: string; caption?: string; mealTypeHint?: MealType };

export function useAnalyzeMeal() {
  return useMutation({
    mutationFn: (payload: AnalyzePayload) =>
      api.post<AnalyzeResponse>("/api/meals/analyze", payload),
    onError: (error) => {
      // `not_food` and `not_configured` are expected outcomes with actionable
      // messages, so the server's wording is better than a generic one.
      toast.error(
        error instanceof ApiRequestError
          ? error.message
          : "Could not analyse that meal.",
      );
    },
  });
}

export interface SaveMealPayload {
  name: string;
  mealType: MealType;
  source: "text" | "photo" | "manual";
  rawInput?: string | null;
  notes?: string | null;
  aiConfidence?: number | null;
  loggedAt?: string;
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

export function useSaveMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveMealPayload) =>
      api.post<ApiMeal>("/api/meals", payload),
    onSuccess: (meal) => {
      toast.success(`${meal.name} logged`, {
        description: `${Math.round(meal.totalCalories)} kcal added to today.`,
      });
      invalidateMealData(queryClient);
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiRequestError ? error.message : "Could not save.",
      );
    },
  });
}

export function useUpdateMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Record<string, unknown>) =>
      api.patch<ApiMeal>(`/api/meals/${id}`, patch),
    onSuccess: () => {
      toast.success("Meal updated");
      invalidateMealData(queryClient);
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiRequestError ? error.message : "Could not update.",
      );
    },
  });
}

/**
 * Delete with an optimistic update.
 *
 * The row disappears immediately and the previous cache is captured so it can
 * be restored if the request fails — otherwise a failed delete leaves the UI
 * claiming the meal is gone.
 */
export function useDeleteMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/api/meals/${id}`),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["dashboard"] });
      await queryClient.cancelQueries({ queryKey: ["meals"] });

      const previous = {
        dashboard: queryClient.getQueriesData({ queryKey: ["dashboard"] }),
        meals: queryClient.getQueriesData({ queryKey: ["meals"] }),
      };

      queryClient.setQueriesData<TodaySummary>(
        { queryKey: queryKeys.today },
        (old) =>
          old
            ? { ...old, meals: old.meals.filter((meal) => meal.id !== id) }
            : old,
      );
      queryClient.setQueriesData<MealListResponse>(
        { queryKey: ["meals"] },
        (old) =>
          old
            ? { ...old, meals: old.meals.filter((meal) => meal.id !== id) }
            : old,
      );

      return previous;
    },

    onError: (error, _id, context) => {
      for (const [key, value] of context?.dashboard ?? []) {
        queryClient.setQueryData(key, value);
      }
      for (const [key, value] of context?.meals ?? []) {
        queryClient.setQueryData(key, value);
      }
      toast.error(
        error instanceof ApiRequestError ? error.message : "Could not delete.",
      );
    },

    onSuccess: () => {
      toast.success("Meal deleted");
    },

    // Totals are derived server-side, so a refetch is required even on success
    // — the optimistic patch removed the row but can't recompute the rings.
    onSettled: () => invalidateMealData(queryClient),
  });
}

/**
 * @param silent suppresses both toasts. Used by background updates the user
 *   didn't initiate — announcing them would be noise, and a failure is not
 *   something they can act on.
 */
export function useUpdateProfile({ silent = false }: { silent?: boolean } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.patch<ApiProfile>("/api/profile", patch),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
      // Goals and timezone both feed the dashboard, so those summaries are
      // now stale.
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (!silent) toast.success("Settings saved");
    },
    onError: (error) => {
      if (silent) return;
      toast.error(
        error instanceof ApiRequestError ? error.message : "Could not save.",
      );
    },
  });
}
