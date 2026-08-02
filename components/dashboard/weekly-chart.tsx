"use client";

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
import type { WeeklySummary } from "@/types/api";

/**
 * Seven-day calorie history.
 *
 * The goal is drawn as a reference line rather than a second series, so bars
 * read as "under" or "over" at a glance. Days with no meals render as empty
 * gaps instead of zero-height bars, which would otherwise imply a fasted day
 * rather than a day the user forgot to log.
 */
export function WeeklyChart({ summary }: { summary: WeeklySummary }) {
  const data = summary.days.map((day) => ({
    date: day.date,
    label: format(parseISO(day.date), "EEE"),
    calories: Math.round(day.totals.calories),
    logged: day.mealCount > 0,
    metGoal: day.metGoal,
  }));

  const peak = Math.max(summary.goals.calories, ...data.map((d) => d.calories));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Last 7 days</CardTitle>
        <p className="text-sm text-muted-foreground">
          {summary.daysLogged > 0
            ? `${Math.round(summary.averageCalories)} kcal avg`
            : "No meals logged"}
        </p>
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
                    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                      <p className="font-medium">
                        {format(parseISO(point.date), "EEEE d MMM")}
                      </p>
                      <p className="text-muted-foreground">
                        {point.logged
                          ? `${point.calories.toLocaleString()} kcal`
                          : "Nothing logged"}
                      </p>
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
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
