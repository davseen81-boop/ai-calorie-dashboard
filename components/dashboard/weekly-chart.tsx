"use client";

import { useState } from "react";

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WeeklySummary } from "@/types/api";

type Mode = "calories" | "macros";

/** Stacked bottom-up in the mark's order, so the chart matches the rings. */
const MACROS = [
  { key: "protein", label: "Protein", hue: "--arc-blue", dot: "bg-arc-blue" },
  { key: "carbs", label: "Carbs", hue: "--arc-orange", dot: "bg-arc-orange" },
  { key: "fat", label: "Fat", hue: "--arc-yellow", dot: "bg-arc-yellow" },
] as const;

/**
 * Seven-day history, as calories or as the macros behind them.
 *
 * The goal is drawn as a reference line rather than a second series, so bars
 * read as "under" or "over" at a glance. Days with no meals render as empty
 * gaps instead of zero-height bars, which would otherwise imply a fasted day
 * rather than a day the user forgot to log.
 *
 * Two modes rather than one stacked chart: stacking by macro answers "what did
 * I eat", but it cannot answer "did I hit my target" for a day logged with
 * calories and no macro detail — that bar would be empty while the day was
 * anything but.
 */
export function WeeklyChart({ summary }: { summary: WeeklySummary }) {
  const [mode, setMode] = useState<Mode>("calories");

  const data = summary.days.map((day) => {
    // Stacked by the energy each macro contributed, not by grams: 10g of fat
    // and 10g of carbs are equal by weight but not by calories, so a
    // gram-stacked bar would be a different chart wearing the same axis.
    const protein = Math.round(day.totals.proteinG * 4);
    const carbs = Math.round(day.totals.carbsG * 4);
    const fat = Math.round(day.totals.fatG * 9);

    return {
      date: day.date,
      label: format(parseISO(day.date), "EEE"),
      calories: Math.round(day.totals.calories),
      protein,
      carbs,
      fat,
      grams: {
        protein: Math.round(day.totals.proteinG),
        carbs: Math.round(day.totals.carbsG),
        fat: Math.round(day.totals.fatG),
      },
      fromMacros: protein + carbs + fat,
      logged: day.mealCount > 0,
      metGoal: day.metGoal,
    };
  });

  const peak = Math.max(
    summary.goals.calories,
    ...data.map((d) => (mode === "calories" ? d.calories : d.fromMacros)),
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Last 7 days</CardTitle>
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-muted-foreground sm:block">
            {summary.daysLogged > 0
              ? `${Math.round(summary.averageCalories)} kcal avg`
              : "No meals logged"}
          </p>
          <div className="flex rounded-lg border p-0.5">
            {(["calories", "macros"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  mode === value
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                domain={[0, Math.ceil((peak * 1.15) / 100) * 100]}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--secondary))", opacity: 0.5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as (typeof data)[number];
                  return (
                    <div className="space-y-1 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                      <p className="font-medium">
                        {format(parseISO(point.date), "EEEE d MMM")}
                      </p>
                      {point.logged ? (
                        <>
                          <p className="text-muted-foreground">
                            {point.calories.toLocaleString()} kcal
                          </p>
                          {/* Macros always shown, whichever mode is on — this
                              is where the detail belongs even when the bars
                              are answering the simpler question. */}
                          <div className="space-y-0.5 text-xs">
                            {MACROS.map((macro) => (
                              <p key={macro.key} className="flex items-center gap-1.5">
                                <span
                                  className={cn("size-2 rounded-full", macro.dot)}
                                  aria-hidden
                                />
                                <span className="text-muted-foreground">
                                  {macro.label}
                                </span>
                                <span className="ml-auto tabular-nums">
                                  {point.grams[macro.key]}g
                                </span>
                                <span className="tabular-nums text-muted-foreground">
                                  {point.fromMacros > 0
                                    ? `${Math.round((point[macro.key] / point.fromMacros) * 100)}%`
                                    : "—"}
                                </span>
                              </p>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Nothing logged</p>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={summary.goals.calories}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
              />
              {mode === "calories" ? (
                <Bar dataKey="calories" radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {data.map((day) => (
                    <Cell
                      key={day.date}
                      fill={
                        !day.logged
                          ? "hsl(var(--secondary))"
                          : day.metGoal
                            ? "hsl(var(--primary))"
                            : "hsl(var(--destructive))"
                      }
                    />
                  ))}
                </Bar>
              ) : (
                // Only the top segment is rounded, so the three read as one bar.
                MACROS.map((macro, index) => (
                  <Bar
                    key={macro.key}
                    dataKey={macro.key}
                    stackId="macros"
                    maxBarSize={44}
                    fill={`hsl(var(${macro.hue}))`}
                    radius={index === MACROS.length - 1 ? [6, 6, 0, 0] : undefined}
                  />
                ))
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
