"use client";

import { useMemo, useState } from "react";
import { Dumbbell, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { Slider } from "@/components/ui/slider";
import { useLogExercise } from "@/hooks/use-exercise";
import { useProfile } from "@/hooks/use-meals";
import {
  ACTIVITIES,
  estimateCaloriesBurned,
  findActivity,
} from "@/lib/nutrition/exercise";

const CUSTOM = "__custom__";

/**
 * Log a workout.
 *
 * The estimate updates live as the sliders move, so the trade — this much
 * exercise buys that many calories — is visible before committing. The figure
 * is still recomputed server-side on save; this is a preview, not the source
 * of truth.
 */
export function LogExerciseSheet() {
  const [open, setOpen] = useState(false);
  const [activityKey, setActivityKey] = useState<string>("walk_brisk");
  const [customName, setCustomName] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [overrideKcal, setOverrideKcal] = useState("");

  const { data: profile } = useProfile();
  const log = useLogExercise();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof ACTIVITIES>();
    for (const activity of ACTIVITIES) {
      const bucket = map.get(activity.group);
      if (bucket) bucket.push(activity);
      else map.set(activity.group, [activity]);
    }
    return Array.from(map.entries());
  }, []);

  const isCustom = activityKey === CUSTOM;
  const activity = isCustom ? undefined : findActivity(activityKey);

  const estimate = estimateCaloriesBurned({
    met: activity?.met ?? 4,
    minutes,
    weightKg: profile?.weightKg,
  });

  const parsedOverride = Number.parseFloat(overrideKcal);
  const usingOverride = Number.isFinite(parsedOverride) && parsedOverride >= 0;
  const shown = usingOverride ? Math.round(parsedOverride) : estimate;

  function reset() {
    setActivityKey("walk_brisk");
    setCustomName("");
    setMinutes(30);
    setOverrideKcal("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Dumbbell className="mr-2 size-4" />
          Log exercise
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log exercise</DialogTitle>
          <DialogDescription>
            Adds to today&apos;s calorie target, so you can eat a little more on
            days you train.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Activity</Label>
            <Select value={activityKey} onValueChange={setActivityKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {grouped.map(([group, items]) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {items.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                <SelectGroup>
                  <SelectLabel>Other</SelectLabel>
                  <SelectItem value={CUSTOM}>Something else…</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {isCustom && (
            <div className="space-y-2">
              <Label htmlFor="custom-activity">What was it?</Label>
              <Input
                id="custom-activity"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Trampolining"
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                Estimated at a moderate effort. Enter the calories below if you
                know them.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Duration</Label>
              <span className="text-sm font-medium tabular-nums">
                {minutes} min
              </span>
            </div>
            <Slider
              value={[minutes]}
              min={5}
              max={180}
              step={5}
              onValueChange={([v]) => setMinutes(v)}
              aria-label="Duration in minutes"
            />
          </div>

          <div className="rounded-xl border bg-secondary/40 p-4 text-center">
            <p className="text-xs text-muted-foreground">Estimated burn</p>
            <p className="text-3xl font-bold tabular-nums text-primary">
              {shown}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                kcal
              </span>
            </p>
            {!profile?.weightKg && !usingOverride && (
              <p className="mt-1 text-xs text-warning">
                Based on an assumed 70 kg — add your weight in Settings for a
                closer figure.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="override">
              Calories from a watch or machine{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="override"
              type="number"
              inputMode="numeric"
              min={0}
              max={5000}
              value={overrideKcal}
              onChange={(e) => setOverrideKcal(e.target.value)}
              placeholder={String(estimate)}
            />
            <p className="text-xs text-muted-foreground">
              Overrides the estimate. Watches tend to read high — treat either
              number as a rough guide.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={log.isPending}
          >
            Cancel
          </Button>
          <Button
            disabled={log.isPending || (isCustom && !customName.trim())}
            onClick={() =>
              log.mutate(
                {
                  ...(isCustom
                    ? { name: customName.trim() }
                    : { activityKey }),
                  durationMinutes: minutes,
                  ...(usingOverride ? { caloriesBurned: parsedOverride } : {}),
                },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            {log.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Log it"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
