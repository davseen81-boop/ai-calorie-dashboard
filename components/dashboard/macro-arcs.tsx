"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DailyGoals, MacroTotals } from "@/types/api";

interface Props {
  consumed: MacroTotals;
  goals: DailyGoals;
}

interface Macro {
  key: string;
  label: string;
  grams: number;
  goal: number;
  /** Energy contributed, for the share figure in the legend. */
  kcal: number;
  hue: string;
  /** Radius in the 100×100 viewBox — outermost first, as in the mark. */
  r: number;
}

const STROKE = 6.5;

/**
 * Macros as three concentric arcs — the logo, carrying data.
 *
 * Each arc is progress against that macro's own target rather than a slice of
 * a shared whole. Now that targets are percentages of a day that itself moves
 * with rest and active days, "am I near this target" is the question worth
 * answering; the share of energy each macro contributed is still in the
 * legend, where it reads better as a number than as an angle.
 */
export function MacroArcs({ consumed, goals }: Props) {
  const macros: Macro[] = [
    {
      key: "protein",
      label: "Protein",
      grams: consumed.proteinG,
      goal: goals.proteinG,
      kcal: consumed.proteinG * 4,
      hue: "--arc-blue",
      r: 42,
    },
    {
      key: "carbs",
      label: "Carbs",
      grams: consumed.carbsG,
      goal: goals.carbsG,
      kcal: consumed.carbsG * 4,
      hue: "--arc-orange",
      r: 30.5,
    },
    {
      key: "fat",
      label: "Fat",
      grams: consumed.fatG,
      goal: goals.fatG,
      kcal: consumed.fatG * 9,
      hue: "--arc-yellow",
      r: 19,
    },
  ];

  const totalKcal = macros.reduce((sum, macro) => sum + macro.kcal, 0);
  const hasData = totalKcal > 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Macros</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="flex h-[180px] items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            className="h-full"
            role="img"
            aria-label={macros
              .map(
                (macro) =>
                  `${macro.label} ${Math.round(macro.grams)} of ${macro.goal} grams`,
              )
              .join(", ")}
          >
            {macros.map((macro) => {
              const circumference = 2 * Math.PI * macro.r;
              const ratio =
                macro.goal > 0
                  ? Math.min(Math.max(macro.grams / macro.goal, 0), 1)
                  : 0;
              const angle = 2 * Math.PI * ratio;

              return (
                <g key={macro.key} transform="rotate(-90 50 50)">
                  <circle
                    cx={50}
                    cy={50}
                    r={macro.r}
                    fill="none"
                    strokeWidth={STROKE}
                    className="stroke-foreground/[0.07]"
                  />
                  <circle
                    cx={50}
                    cy={50}
                    r={macro.r}
                    fill="none"
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    stroke={`hsl(var(${macro.hue}))`}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - ratio)}
                    className="arc-glow transition-[stroke-dashoffset] duration-700 ease-out"
                    style={
                      { "--glow-color": `var(${macro.hue})` } as React.CSSProperties
                    }
                  />
                  {ratio > 0.01 && (
                    <circle
                      cx={50 + macro.r * Math.cos(angle)}
                      cy={50 + macro.r * Math.sin(angle)}
                      r={2.2}
                      fill="hsl(var(--spark))"
                      className="spark-glow transition-all duration-700 ease-out"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <ul className="mt-3 space-y-2">
          {macros.map((macro) => {
            const share = hasData ? Math.round((macro.kcal / totalKcal) * 100) : 0;

            return (
              <li key={macro.key} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: `hsl(var(${macro.hue}))` }}
                  aria-hidden
                />
                <span className="flex-1 text-muted-foreground">{macro.label}</span>
                <span
                  className={cn(
                    "w-10 text-right text-xs tabular-nums text-muted-foreground",
                    !hasData && "opacity-0",
                  )}
                >
                  {share}%
                </span>
                <span className="w-24 text-right font-medium tabular-nums">
                  {Math.round(macro.grams)}
                  <span className="text-muted-foreground"> / {macro.goal}g</span>
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-2 text-[11px] text-muted-foreground">
          {hasData
            ? "Rings show progress to target; the percentage is that macro's share of today's energy."
            : "Log a meal to see the day fill in."}
        </p>
      </CardContent>
    </Card>
  );
}
