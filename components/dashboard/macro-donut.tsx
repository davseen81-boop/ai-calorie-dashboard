"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyGoals, MacroTotals } from "@/types/api";

interface Props {
  consumed: MacroTotals;
  goals: DailyGoals;
}

/**
 * Macro split as a donut.
 *
 * Slices are sized by *calorie* contribution, not by grams — 10g of fat and 10g
 * of carbs are visually equal by weight but contribute very differently to the
 * day's energy, so a gram-weighted donut would misrepresent the split. The
 * labels still show grams, because that is what the goals are set in.
 */
export function MacroDonut({ consumed, goals }: Props) {
  const macros = [
    {
      key: "protein",
      label: "Protein",
      grams: consumed.proteinG,
      goal: goals.proteinG,
      kcal: consumed.proteinG * 4,
      color: "hsl(var(--protein))",
    },
    {
      key: "carbs",
      label: "Carbs",
      grams: consumed.carbsG,
      goal: goals.carbsG,
      kcal: consumed.carbsG * 4,
      color: "hsl(var(--carbs))",
    },
    {
      key: "fat",
      label: "Fat",
      grams: consumed.fatG,
      goal: goals.fatG,
      kcal: consumed.fatG * 9,
      color: "hsl(var(--fat))",
    },
  ];

  const totalKcal = macros.reduce((sum, m) => sum + m.kcal, 0);
  const hasData = totalKcal > 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Macros</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[180px]">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={macros}
                  dataKey="kcal"
                  nameKey="label"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={2}
                  strokeWidth={0}
                  isAnimationActive={false}
                >
                  {macros.map((macro) => (
                    <Cell key={macro.key} fill={macro.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">
                Log a meal to see your macro split
              </p>
            </div>
          )}
        </div>

        <ul className="mt-3 space-y-2">
          {macros.map((macro) => (
            <li key={macro.key} className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: macro.color }}
                aria-hidden
              />
              <span className="flex-1 text-muted-foreground">{macro.label}</span>
              <span className="tabular-nums font-medium">
                {Math.round(macro.grams)}
                <span className="text-muted-foreground">
                  {" "}
                  / {macro.goal}g
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
