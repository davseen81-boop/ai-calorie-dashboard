"use client";

import { cn } from "@/lib/utils";

interface Props {
  consumed: number;
  goal: number;
  /** 0..1+ — values above 1 mean the goal was exceeded. */
  progress: number;
}

/**
 * Circular progress ring for the daily calorie goal.
 *
 * Drawn as an SVG rather than a chart library: it is one arc, and stroke-dash
 * animation is smoother than a re-rendered chart. The visible arc is capped at
 * 100% so an overshoot doesn't wrap around and read as "nearly done", while the
 * numeric readout still shows the true figure.
 */
export function CalorieRing({ consumed, goal, progress }: Props) {
  const size = 208;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const clamped = Math.min(Math.max(progress, 0), 1);
  const offset = circumference * (1 - clamped);
  const over = progress > 1;
  const remaining = goal - consumed;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        // Rotated so the arc starts at 12 o'clock rather than 3 o'clock.
        className="-rotate-90"
        role="img"
        aria-label={`${Math.round(consumed)} of ${goal} calories consumed`}
      >
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--gradient-from))" />
            <stop offset="100%" stopColor="hsl(var(--gradient-to))" />
          </linearGradient>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          stroke={over ? "hsl(var(--destructive))" : "url(#ring-gradient)"}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums tracking-tight">
          {Math.round(consumed)}
        </span>
        <span className="text-xs text-muted-foreground">of {goal} kcal</span>
        <span
          className={cn(
            "mt-1 text-sm font-medium tabular-nums",
            over ? "text-destructive" : "text-success",
          )}
        >
          {over
            ? `${Math.round(Math.abs(remaining))} over`
            : `${Math.round(remaining)} left`}
        </span>
      </div>
    </div>
  );
}
