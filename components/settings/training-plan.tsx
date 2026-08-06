"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ACTIVITIES } from "@/lib/nutrition/exercise";
import {
  useAddTrainingSession,
  useRemoveTrainingSession,
  useTrainingPlan,
} from "@/hooks/use-training-plan";

/** ISO weekdays, Monday first. */
const DAYS = [
  { value: 1, short: "M", label: "Monday" },
  { value: 2, short: "T", label: "Tuesday" },
  { value: 3, short: "W", label: "Wednesday" },
  { value: 4, short: "T", label: "Thursday" },
  { value: 5, short: "F", label: "Friday" },
  { value: 6, short: "S", label: "Saturday" },
  { value: 7, short: "S", label: "Sunday" },
];

const GROUPS = Array.from(new Set(ACTIVITIES.map((a) => a.group)));

/**
 * The user's normal training week.
 *
 * This is what turns a per-day calorie target from a guess into arithmetic:
 * knowing Tuesday is a 45-minute run gives an actual figure for what a training
 * day costs, so the gap between a rest day and a training day can be that
 * number rather than an arbitrary percentage.
 *
 * It also decides which days default to training on the dashboard, so a normal
 * week needs no daily tapping.
 */
export function TrainingPlanCard({
  onApply,
}: {
  /** Writes the suggested figures into the profile's day targets. */
  onApply: (targets: { rest: number; training: number }) => void;
}) {
  const plan = useTrainingPlan();
  const add = useAddTrainingSession();
  const remove = useRemoveTrainingSession();

  const [name, setName] = useState("");
  const [activityKey, setActivityKey] = useState<string>("run_easy");
  const [minutes, setMinutes] = useState(45);
  const [days, setDays] = useState<number[]>([]);

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  function submit() {
    const activity = ACTIVITIES.find((a) => a.key === activityKey);
    add.mutate(
      {
        // Falls back to the activity's own label, so naming is optional.
        name: name.trim() || activity?.label || "Training",
        activityKey,
        durationMinutes: minutes,
        daysOfWeek: days,
      },
      {
        onSuccess: () => {
          setName("");
          setDays([]);
        },
      },
    );
  }

  const canAdd = days.length > 0 && minutes >= 5 && !add.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your training week</CardTitle>
        <CardDescription>
          Tell it what you normally do and it works out what a training day
          actually costs — then sets your rest and training targets from that
          instead of a flat percentage.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {plan.isPending ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : plan.isError ? (
          <p className="text-sm text-destructive">
            Could not load your plan. Reload the page to try again.
          </p>
        ) : (
          <>
            {plan.data.sessions.length > 0 && (
              <ul className="space-y-2">
                {plan.data.sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{session.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.durationMinutes} min ·{" "}
                        {session.daysOfWeek
                          .map((d) => DAYS.find((x) => x.value === d)?.label.slice(0, 3))
                          .join(", ")}{" "}
                        · {session.caloriesPerSession} kcal each
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove.mutate(session.id)}
                      aria-label={`Remove ${session.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* ---- Add a session ---- */}
            <div className="space-y-3 rounded-xl border border-dashed p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Activity</Label>
                  <Select value={activityKey} onValueChange={setActivityKey}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUPS.map((group) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{group}</SelectLabel>
                          {ACTIVITIES.filter((a) => a.group === group).map((a) => (
                            <SelectItem key={a.key} value={a.key}>
                              {a.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="session-minutes" className="text-xs text-muted-foreground">
                    Minutes
                  </Label>
                  <NumberInput
                    id="session-minutes"
                    value={minutes === 0 ? null : minutes}
                    onChange={setMinutes}
                    emptyValue={0}
                    max={600}
                    placeholder="45"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="session-name" className="text-xs text-muted-foreground">
                  Name (optional)
                </Label>
                <Input
                  id="session-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Parkrun, leg day…"
                  maxLength={80}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Which days?</Label>
                <div className="flex gap-1.5">
                  {DAYS.map((day) => {
                    const on = days.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        aria-pressed={on}
                        aria-label={day.label}
                        className={cn(
                          "size-11 flex-1 rounded-lg border-2 text-sm font-semibold transition-colors",
                          on
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!canAdd}
                onClick={submit}
              >
                {add.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 size-4" />
                    Add to my week
                  </>
                )}
              </Button>
            </div>

            {/* ---- What it implies ---- */}
            {plan.data.trainingDays.length > 0 && (
              <div className="space-y-3 rounded-xl bg-secondary/60 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Figure
                    label="Training days"
                    value={`${plan.data.trainingDays.length} a week`}
                  />
                  <Figure
                    label="Burned training"
                    value={`${plan.data.weeklyCalories.toLocaleString()} kcal/wk`}
                  />
                  <Figure
                    label="Rest day target"
                    value={`${plan.data.suggested.restDayCalories.toLocaleString()} kcal`}
                  />
                  <Figure
                    label="Training day target"
                    value={`${plan.data.suggested.trainingDayCalories.toLocaleString()} kcal`}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  A training day is{" "}
                  <strong className="text-foreground">
                    {plan.data.suggested.difference} kcal
                  </strong>{" "}
                  above a rest day — what your training actually costs. The week
                  still averages {plan.data.suggested.weeklyAverage.toLocaleString()}{" "}
                  kcal, so this moves calories around rather than adding them.
                  {plan.data.usingAssumedWeight &&
                    " Add your weight above for a figure based on you rather than an assumed 70 kg."}
                  {plan.data.suggested.flooredAt !== null &&
                    ` The rest day was held at ${plan.data.suggested.flooredAt} kcal and the difference taken off the training day.`}
                </p>

                <Button
                  type="button"
                  className="gradient-primary w-full hover:opacity-90"
                  onClick={() =>
                    onApply({
                      rest: plan.data.suggested.restDayCalories,
                      training: plan.data.suggested.trainingDayCalories,
                    })
                  }
                >
                  Use these targets
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
