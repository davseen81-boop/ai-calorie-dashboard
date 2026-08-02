"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Monitor, Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { QueryError } from "@/components/ui/query-states";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useProfile, useUpdateProfile } from "@/hooks/use-meals";
import {
  detectBrowserTimeZone,
  listTimeZones,
  timeZoneOffsetLabel,
} from "@/lib/timezones";
import type { Theme } from "@/lib/db/schema";

const SUGGESTED_PREFERENCES = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten-free",
  "dairy-free",
  "halal",
  "kosher",
  "low-carb",
  "keto",
  "nut allergy",
];

export default function SettingsPage() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const { theme, setTheme } = useTheme();

  const [calories, setCalories] = useState(2000);
  const [protein, setProtein] = useState(150);
  const [carbs, setCarbs] = useState(200);
  const [fat, setFat] = useState(65);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [customPreference, setCustomPreference] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [loaded, setLoaded] = useState(false);

  // Computed once — the zone list is ~400 entries and never changes.
  const zones = useMemo(listTimeZones, []);
  const browserZone = useMemo(detectBrowserTimeZone, []);

  // Seed the controls once the profile arrives. Guarded so a background
  // refetch can't overwrite edits the user is midway through.
  useEffect(() => {
    if (!profile.data || loaded) return;
    setCalories(profile.data.dailyCalorieGoal);
    setProtein(profile.data.proteinGoalG);
    setCarbs(profile.data.carbsGoalG);
    setFat(profile.data.fatGoalG);
    setPreferences(profile.data.dietaryPreferences);
    setTimezone(profile.data.timezone);
    setLoaded(true);
  }, [profile.data, loaded]);

  // Recomputed on render so it reflects the zone currently selected, giving
  // immediate feedback that the choice is the intended one.
  const localNow = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
    } catch {
      return "—";
    }
  }, [timezone]);

  if (profile.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[220px] rounded-xl" />
      </div>
    );
  }

  if (profile.isError) {
    return (
      <QueryError error={profile.error} onRetry={() => void profile.refetch()} />
    );
  }

  // Macro goals imply a calorie total; if it drifts far from the calorie goal
  // the targets contradict each other, so surface it rather than silently
  // storing an inconsistent set.
  const macroCalories = protein * 4 + carbs * 4 + fat * 9;
  const drift = Math.abs(macroCalories - calories);
  const macrosDisagree = drift > calories * 0.1;

  const dirty =
    calories !== profile.data.dailyCalorieGoal ||
    protein !== profile.data.proteinGoalG ||
    carbs !== profile.data.carbsGoalG ||
    fat !== profile.data.fatGoalG ||
    preferences.join("|") !== profile.data.dietaryPreferences.join("|");

  function addPreference(value: string) {
    const clean = value.trim().toLowerCase();
    if (!clean || preferences.includes(clean) || preferences.length >= 20) return;
    setPreferences([...preferences, clean]);
    setCustomPreference("");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Targets and preferences used across the dashboard and by the AI.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily targets</CardTitle>
          <CardDescription>
            Your calorie goal drives the progress ring; macro goals drive the
            donut.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SliderField
            label="Calories"
            value={calories}
            min={1000}
            max={5000}
            step={50}
            unit="kcal"
            onChange={setCalories}
          />
          <SliderField
            label="Protein"
            value={protein}
            min={0}
            max={300}
            step={5}
            unit="g"
            accent="protein"
            onChange={setProtein}
          />
          <SliderField
            label="Carbs"
            value={carbs}
            min={0}
            max={500}
            step={5}
            unit="g"
            accent="carbs"
            onChange={setCarbs}
          />
          <SliderField
            label="Fat"
            value={fat}
            min={0}
            max={200}
            step={5}
            unit="g"
            accent="fat"
            onChange={setFat}
          />

          <div
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              macrosDisagree
                ? "bg-warning/10 text-warning"
                : "bg-secondary/60 text-muted-foreground",
            )}
          >
            Your macros add up to{" "}
            <span className="font-medium tabular-nums">
              {macroCalories.toLocaleString()} kcal
            </span>
            {macrosDisagree
              ? ` — that's ${drift.toLocaleString()} away from your calorie goal.`
              : " — consistent with your calorie goal."}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dietary preferences</CardTitle>
          <CardDescription>
            Passed to the AI as context — it uses these to pick the more likely
            reading when a description is ambiguous.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {preferences.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {preferences.map((pref) => (
                <Badge key={pref} variant="secondary" className="gap-1 capitalize">
                  {pref}
                  <button
                    type="button"
                    onClick={() =>
                      setPreferences(preferences.filter((p) => p !== pref))
                    }
                    aria-label={`Remove ${pref}`}
                    className="ml-0.5 rounded-full hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={customPreference}
              onChange={(e) => setCustomPreference(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPreference(customPreference);
                }
              }}
              placeholder="Add your own…"
              maxLength={40}
            />
            <Button
              variant="outline"
              onClick={() => addPreference(customPreference)}
              disabled={!customPreference.trim()}
            >
              Add
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PREFERENCES.filter((p) => !preferences.includes(p)).map(
              (pref) => (
                <button
                  key={pref}
                  type="button"
                  onClick={() => addPreference(pref)}
                  className="rounded-full border px-3 py-1 text-xs capitalize text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  + {pref}
                </button>
              ),
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timezone</CardTitle>
          <CardDescription>
            Decides which day a meal counts towards. Detected automatically on
            first run — change it if you travel or it guessed wrong.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={timezone}
            onValueChange={(value) => {
              setTimezone(value);
              update.mutate({ timezone: value });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {zones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                  <span className="ml-2 text-muted-foreground">
                    {timeZoneOffsetLabel(zone)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-sm text-muted-foreground">
            Your local time is{" "}
            <span className="font-medium tabular-nums text-foreground">
              {localNow}
            </span>
            {timezone !== browserZone && (
              <>
                {" — "}
                <button
                  type="button"
                  className="font-medium text-primary underline underline-offset-2"
                  onClick={() => {
                    setTimezone(browserZone);
                    update.mutate({ timezone: browserZone });
                  }}
                >
                  use this device&apos;s zone ({browserZone.replace(/_/g, " ")})
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>
            Applies immediately and is remembered on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Monitor },
              ] as const
            ).map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setTheme(option.value);
                    // Persisted too, so the choice survives a new device.
                    update.mutate({ theme: option.value satisfies Theme });
                  }}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "text-muted-foreground hover:border-primary/40",
                  )}
                >
                  <Icon className="size-5" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sticky so the save action stays reachable on a long mobile page. */}
      <div className="sticky bottom-20 z-30 md:bottom-4">
        <Button
          className="gradient-primary w-full text-white shadow-lg hover:opacity-90"
          size="lg"
          disabled={!dirty || update.isPending}
          onClick={() =>
            update.mutate({
              dailyCalorieGoal: calories,
              proteinGoalG: protein,
              carbsGoalG: carbs,
              fatGoalG: fat,
              dietaryPreferences: preferences,
            })
          }
        >
          {update.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Saving…
            </>
          ) : dirty ? (
            "Save changes"
          ) : (
            "All changes saved"
          )}
        </Button>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  accent,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  accent?: "protein" | "carbs" | "fat";
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          {accent && (
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: `hsl(var(--${accent}))` }}
              aria-hidden
            />
          )}
          {label}
        </Label>
        <span className="text-sm font-medium tabular-nums">
          {value.toLocaleString()} {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
        aria-label={`${label} goal`}
      />
    </div>
  );
}
