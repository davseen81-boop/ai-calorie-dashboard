import { cn } from "@/lib/utils";

/**
 * The Energy Arc mark.
 *
 * Rebuilt as vector rather than shipping the artwork as a bitmap: it has to
 * work at 20px in a header and 512px as an app icon, retint between themes,
 * and animate. Three arcs of decreasing radius, each starting later than the
 * one outside it, which is what gives the mark its inward spiral.
 */

interface ArcSpec {
  /** Radius in the 100×100 viewBox. */
  r: number;
  /** Fraction of the full circle the arc covers. */
  sweep: number;
  /** Degrees clockwise from 12 o'clock where the arc begins. */
  from: number;
  /** CSS custom property holding the arc's hue. */
  hue: string;
}

const ARCS: ArcSpec[] = [
  { r: 40, sweep: 0.8, from: 0, hue: "--arc-blue" },
  { r: 30, sweep: 0.76, from: 35, hue: "--arc-orange" },
  { r: 20, sweep: 0.7, from: 62, hue: "--arc-yellow" },
];

const STROKE = 4.5;

interface Props {
  className?: string;
  /** Draws the arcs on when mounted. Used where the mark is the hero, not in
   *  the header — where every navigation would replay it. */
  animated?: boolean;
  /** The lit head of the outer arc. Off for flat contexts like a favicon. */
  showSpark?: boolean;
}

export function EnergyArcMark({
  className,
  animated = false,
  showSpark = true,
}: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Energy Arc"
    >
      {ARCS.map((arc, index) => {
        const circumference = 2 * Math.PI * arc.r;
        const length = circumference * arc.sweep;

        return (
          <circle
            key={arc.r}
            cx={50}
            cy={50}
            r={arc.r}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            stroke={`hsl(var(${arc.hue}))`}
            strokeDasharray={`${length} ${circumference}`}
            // -90 puts the dash origin at 12 o'clock instead of 3.
            transform={`rotate(${arc.from - 90} 50 50)`}
            className={cn("arc-glow", animated && "animate-arc-draw")}
            style={
              {
                "--glow-color": `var(${arc.hue})`,
                "--arc-len": length,
                // Outer arc first, so the mark resolves from the outside in.
                animationDelay: animated ? `${index * 130}ms` : undefined,
              } as React.CSSProperties
            }
          />
        );
      })}

      {/* The lit head of the outer arc. White on the dark brand background,
          dark on a light one — see `--spark`. */}
      {showSpark && (
        <circle
          cx={50}
          cy={50 - ARCS[0].r}
          r={2.8}
          fill="hsl(var(--spark))"
          className={cn("spark-glow", animated && "animate-dot-pulse")}
        />
      )}
    </svg>
  );
}

/** The wordmark, in the logo's wide tracking. */
export function EnergyArcWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("wordmark font-medium", className)}>Energy Arc</span>
  );
}

/** Mark and wordmark together, as they appear in the header. */
export function EnergyArcLogo({
  className,
  animated,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <EnergyArcMark className="size-8" animated={animated} />
      <EnergyArcWordmark className="text-base" />
    </span>
  );
}
