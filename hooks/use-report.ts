"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import type { PeriodReport, ReportPeriod } from "@/types/api";

export function useReport(period: ReportPeriod, offset: number) {
  return useQuery({
    queryKey: ["report", period, offset],
    queryFn: () =>
      api.get<PeriodReport>(`/api/reports?period=${period}&offset=${offset}`),
    // A past period cannot change unless the user edits history, so it can be
    // held far longer than today's numbers.
    staleTime: offset === 0 ? 30_000 : 5 * 60_000,
  });
}
