"use client";

import { Flame, Target, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MacroTotals, DailyGoals } from "@/types/api";

interface Props {
  consumed: MacroTotals;
  goals: DailyGoals;
  remaining: number;
}

/**
 * Consumed / Goal / Remaining.
 *
 * Only Remaining is colour-coded: it is the number that carries a judgement
 * (on track vs over), while the other two are neutral facts. Colouring all
 * three would dilute the signal.
 */
export function SummaryCards({ consumed, goals, remaining }: Props) {
  const over = remaining < 0;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        icon={<Flame className="size-4" />}
        label="Consumed"
        value={Math.round(consumed.calories)}
        unit="kcal"
      />
      <StatCard
        icon={<Target className="size-4" />}
        label="Daily goal"
        value={goals.calories}
        unit="kcal"
      />
      <StatCard
        icon={
          over ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />
        }
        label={over ? "Over by" : "Remaining"}
        value={Math.round(Math.abs(remaining))}
        unit="kcal"
        tone={over ? "destructive" : "success"}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  tone?: "neutral" | "success" | "destructive";
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            tone === "neutral" && "bg-secondary text-muted-foreground",
            tone === "success" && "bg-success/10 text-success",
            tone === "destructive" && "bg-destructive/10 text-destructive",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p
            className={cn(
              "text-xl font-semibold tabular-nums",
              tone === "success" && "text-success",
              tone === "destructive" && "text-destructive",
            )}
          >
            {value.toLocaleString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {unit}
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
