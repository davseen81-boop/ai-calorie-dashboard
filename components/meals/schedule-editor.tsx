"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ScheduleDraft {
  /** ISO weekdays, 1 = Monday. */
  daysOfWeek: number[];
  /** `HH:mm`, 24-hour. */
  timeOfDay: string;
}

const DAYS = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 7, label: "S" },
];

const PRESETS = [
  { label: "Every day", days: [1, 2, 3, 4, 5, 6, 7] },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [6, 7] },
];

/** Day-of-week toggles plus a time, shared by the create and manage screens. */
export function ScheduleEditor({
  value,
  onChange,
}: {
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
}) {
  function toggleDay(day: number) {
    const next = value.daysOfWeek.includes(day)
      ? value.daysOfWeek.filter((d) => d !== day)
      : [...value.daysOfWeek, day].sort((a, b) => a - b);
    // At least one day must remain, or the schedule could never fire.
    if (next.length === 0) return;
    onChange({ ...value, daysOfWeek: next });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Days</Label>
        <div className="flex gap-1.5">
          {DAYS.map((day, index) => {
            const active = value.daysOfWeek.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                aria-pressed={active}
                aria-label={
                  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index]
                }
                className={cn(
                  "size-8 rounded-full text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/70",
                )}
              >
                {day.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange({ ...value, daysOfWeek: preset.days })}
              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="schedule-time" className="text-xs text-muted-foreground">
          Time
        </Label>
        <Input
          id="schedule-time"
          type="time"
          value={value.timeOfDay}
          onChange={(e) => onChange({ ...value, timeOfDay: e.target.value })}
          className="w-32"
        />
      </div>
    </div>
  );
}
