"use client";

import { cn } from "@/lib/utils";

interface Props {
  consumed: number;
  goal: number;
  /** 0..1+ — values above 1 mean the goal was exceeded. */
  progress: number;
}

/**
 * The day's energy arc.
 *
 * The hero of the dashboard and a direct echo of the logo: one arc sweeping
 * clockwise from noon through the mark's three colours, led by a lit head at
 * the point you've reached. Drawn as SVG rather than a chart library — it is
 * one arc, and stroke-dash animation is smoother than a re-rendered chart.
 *
 * The visible arc is capped at 100% so an overshoot doesn't wrap around and
 * read as "nearly done", while the numeric readout still shows the truth.
 */
export function CalorieRing({ consumed, goal, progress }: Props) {
  const size = 208;
  const stroke = 14;
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const clamped = Math.min(Math.max(progress, 0), 1);
  const offset = circumference * (1 - clamped);
  const over = progress > 1;
  const remaining = goal - consumed;

  // Where the arc currently ends. Computed from 3 o'clock because the whole
  // SVG is rotated a quarter turn to start the arc at noon.
  const angle = 2 * Math.PI * clamped;
  const headX = center + radius * Math.cos(angle);
  const headY = center + radius * Math.sin(angle);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label={`${Math.round(consumed)} of ${goal} calories consumed`}
      >
        <defs>
          {/* Right-to-left, which lands vertical on screen.
              The gradient is defined inside the SVG, so the quarter-turn
              applied to the whole element rotates it too — a visually
              "vertical" gradient has to be authored horizontally. Getting this
              wrong is invisible in code and obvious on screen: the arc begins
              at the gradient's midpoint and the blue end never renders.

              Laid out so a full circle reads blue → orange → yellow → orange →
              blue, which also means no seam where the ring closes. */}
          <linearGradient id="arc-sweep" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--arc-blue))" />
            <stop offset="50%" stopColor="hsl(var(--arc-orange))" />
            <stop offset="100%" stopColor="hsl(var(--arc-yellow))" />
          </linearGradient>
        </defs>

        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-foreground/[0.07]"
        />

        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          stroke={over ? "hsl(var(--destructive))" : "url(#arc-sweep)"}
          className="arc-glow transition-[stroke-dashoffset] duration-700 ease-out"
          style={
            {
              "--glow-color": over ? "var(--destructive)" : "var(--arc-orange)",
            } as React.CSSProperties
          }
        />

        {/* The lit head. Hidden at zero, where it would sit at noon and imply
            progress that hasn't happened. */}
        {clamped > 0.005 && (
          <circle
            cx={headX}
            cy={headY}
            r={4}
            fill="hsl(var(--spark))"
            className="spark-glow transition-all duration-700 ease-out"
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-light tabular-nums tracking-tight">
          {Math.round(consumed)}
        </span>
        <span className="mt-0.5 text-xs uppercase tracking-[0.16em] text-muted-foreground">
          of {goal} kcal
        </span>
        <span
          className={cn(
            // Matches the Remaining card directly above it — the same fact
            // in two colours reads as two different facts.
            "mt-2 text-sm font-medium tabular-nums",
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
