"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-states";
import { cn } from "@/lib/utils";
import { useReport } from "@/hooks/use-report";
import type { DayStatus, PeriodReport, ReportPeriod } from "@/types/api";

/**
 * Did the week — or the month — meet its targets?
 *
 * Each day is judged against its own target, because the target moves: a
 * training day and a rest day are hundreds of calories apart, and one period
 * average against one number would mark a heavy day as an overshoot.
 */
export function PeriodReportView() {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [offset, setOffset] = useState(0);

  const report = useReport(period, offset);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border p-0.5">
          {(["week", "month"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setPeriod(value);
                setOffset(0);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                period === value
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOffset((o) => Math.min(o + 1, 52))}
            aria-label={`Previous ${period}`}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium">
            {report.data?.label ?? "…"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(o - 1, 0))}
            aria-label={`Next ${period}`}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {report.isPending ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : report.isError ? (
        <QueryError error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <ReportBody report={report.data} />
      )}
    </div>
  );
}

function ReportBody({ report }: { report: PeriodReport }) {
  const { totals } = report;
  const nothing = totals.daysLogged === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <Verdict report={report} />

          {!nothing && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Average eaten"
                  value={totals.averageConsumed.toLocaleString()}
                  unit="kcal"
                />
                <Stat
                  label="Average target"
                  value={totals.averageTarget.toLocaleString()}
                  unit="kcal"
                />
                <Stat
                  label="Difference"
                  value={`${totals.difference > 0 ? "+" : ""}${totals.difference.toLocaleString()}`}
                  unit="kcal a day"
                  tone={
                    Math.abs(totals.difference) <= totals.averageTarget * 0.05
                      ? "good"
                      : totals.difference > 0
                        ? "over"
                        : "under"
                  }
                />
                <Stat
                  label="Days logged"
                  value={`${totals.daysLogged}/${totals.daysElapsed}`}
                  unit={report.inProgress ? "so far" : "days"}
                />
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <Pill status="on_target" count={totals.onTargetDays} label="on target" />
                <Pill status="over" count={totals.overDays} label="over" />
                <Pill status="under" count={totals.underDays} label="under" />
                {totals.notLoggedDays > 0 && (
                  <Pill status="not_logged" count={totals.notLoggedDays} label="not logged" />
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!nothing && (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">Each day against its own target</p>
              <DayBars days={report.days} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">Average macros a day</p>
              <MacroRow label="Protein" {...report.macros.protein} colour="bg-arc-blue" />
              <MacroRow label="Carbs" {...report.macros.carbs} colour="bg-arc-orange" />
              <MacroRow label="Fat" {...report.macros.fat} colour="bg-arc-yellow" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** The headline answer, stated plainly. */
function Verdict({ report }: { report: PeriodReport }) {
  const { totals } = report;

  if (totals.daysLogged === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing logged in this {report.period}. There is no answer to give until
        there is something to measure.
      </p>
    );
  }

  // Deliberately not a verdict. An average built from a third of the days says
  // more about which days got logged than about what was eaten.
  if (totals.metTarget === null) {
    return (
      <div>
        <p className="text-lg font-semibold text-warning">Not enough logged to say</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {totals.daysLogged} of {totals.daysElapsed} days have meals on them.
          The average below is real, but it only covers the days you recorded.
        </p>
      </div>
    );
  }

  const over = totals.difference > 0;

  return (
    <div>
      <p
        className={cn(
          "text-lg font-semibold",
          totals.metTarget ? "text-success" : over ? "text-destructive" : "text-warning",
        )}
      >
        {totals.metTarget
          ? `On target${report.inProgress ? " so far" : ""}`
          : over
            ? `${Math.abs(totals.difference).toLocaleString()} kcal a day over`
            : `${Math.abs(totals.difference).toLocaleString()} kcal a day under`}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {totals.metTarget
          ? `Averaging ${totals.averageConsumed.toLocaleString()} kcal against a ${totals.averageTarget.toLocaleString()} target across ${totals.daysLogged} logged ${totals.daysLogged === 1 ? "day" : "days"}.`
          : over
            ? `That is about ${Math.abs(totals.difference * totals.daysElapsed).toLocaleString()} kcal over the ${report.period}. One heavy day matters little; a steady gap is what moves the trend.`
            : `That is about ${Math.abs(totals.difference * totals.daysElapsed).toLocaleString()} kcal under the ${report.period}. Eating well below target regularly is worth a word with a doctor or dietitian.`}
      </p>
    </div>
  );
}

/** Height of the plot area. */
const CHART_HEIGHT = 112;

/**
 * One bar per day, height by intake, colour by how it landed, with each day's
 * own target drawn as a line across its bar.
 *
 * Sized in pixels rather than percentages: a percentage height inside nested
 * flex containers has no definite parent to resolve against, and the bars
 * collapse to nothing.
 */
function DayBars({ days }: { days: PeriodReport["days"] }) {
  const peak = Math.max(...days.map((d) => Math.max(d.consumed, d.target)), 1);
  const scale = (value: number) => Math.round((value / peak) * CHART_HEIGHT);

  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-1">
      {days.map((day) => {
        const barHeight = day.consumed > 0 ? Math.max(scale(day.consumed), 2) : 0;

        return (
          <div
            key={day.date}
            className="flex min-w-5 flex-1 flex-col items-center gap-1"
            title={`${format(parseISO(day.date), "EEE d MMM")} — ${Math.round(day.consumed)} of ${day.target} kcal (${day.dayType})`}
          >
            <div className="relative w-full" style={{ height: CHART_HEIGHT }}>
              <div
                className={cn("absolute inset-x-0 bottom-0 rounded-t", BAR[day.status])}
                style={{ height: barHeight }}
              />
              <div
                className="absolute inset-x-0 border-t border-dashed border-muted-foreground/60"
                style={{ bottom: scale(day.target) }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              {format(parseISO(day.date), "EEEEE")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const BAR: Record<DayStatus, string> = {
  on_target: "bg-success",
  over: "bg-destructive",
  under: "bg-warning",
  not_logged: "bg-transparent",
};

const PILL: Record<DayStatus, string> = {
  on_target: "border-success/40 text-success",
  over: "border-destructive/40 text-destructive",
  under: "border-warning/40 text-warning",
  not_logged: "border-border text-muted-foreground",
};

function Pill({
  status,
  count,
  label,
}: {
  status: DayStatus;
  count: number;
  label: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 font-medium tabular-nums",
        PILL[status],
      )}
    >
      {count} {label}
    </span>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "good" | "over" | "under";
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "good" && "text-success",
          tone === "over" && "text-destructive",
          tone === "under" && "text-warning",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{unit}</p>
    </div>
  );
}

function MacroRow({
  label,
  average,
  target,
  colour,
}: {
  label: string;
  average: number;
  target: number;
  colour: string;
}) {
  const percent = target > 0 ? Math.min((average / target) * 100, 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {average}
          <span className="text-muted-foreground"> / {target}g</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className={cn("h-full rounded-full", colour)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
