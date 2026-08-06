"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";

/**
 * A number field you can actually empty.
 *
 * Binding an `<input type="number">` straight to a number makes it impossible
 * to clear: the empty string parses to NaN, the handler falls back to 0, and
 * the field immediately re-renders as "0" under the cursor. Typing a figure
 * then means selecting the zero first, every field, every time.
 *
 * So the text being edited is held separately from the committed number. Empty
 * is a legitimate state while typing, and `emptyValue` decides what that means
 * to the caller — 0 for a macro that genuinely is none, null for an optional
 * target that should fall back to a default.
 */
interface Props<T extends number | null> {
  value: number | null;
  onChange: (value: T) => void;
  /** What an empty field commits. */
  emptyValue: T;
  min?: number;
  max?: number;
  step?: number;
  /** Shown greyed when empty — keeps the default visible without typing it. */
  placeholder?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

/** Empty unless there is something worth showing. */
function toDraft(value: number | null): string {
  return value === null ? "" : String(value);
}

export function NumberInput<T extends number | null>({
  value,
  onChange,
  emptyValue,
  min,
  max,
  step,
  placeholder = "0",
  id,
  className,
  ...rest
}: Props<T>) {
  const [draft, setDraft] = useState(() => toDraft(value));
  const [lastValue, setLastValue] = useState(value);

  // Adjusting state during render rather than in an effect: the documented way
  // to react to a prop change without a second render pass. The draft is left
  // alone when it already represents `value`, so typing "0.50" is not rewritten
  // to "0.5" mid-keystroke.
  if (value !== lastValue) {
    setLastValue(value);
    if (draft.trim() === "" || Number.parseFloat(draft) !== value) {
      setDraft(toDraft(value));
    }
  }

  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      value={draft}
      className={className}
      {...rest}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);

        if (raw.trim() === "") {
          onChange(emptyValue);
          return;
        }

        const parsed = Number.parseFloat(raw);
        // A half-typed "-" or "." parses to NaN. Keeping the draft but not
        // committing lets the user finish the number.
        if (!Number.isFinite(parsed)) return;

        const clamped =
          min !== undefined && parsed < min
            ? min
            : max !== undefined && parsed > max
              ? max
              : parsed;

        onChange(clamped as T);
      }}
      // Tidies "007" or a stray "." once the user moves on, without
      // interfering while they are still typing.
      onBlur={() => setDraft(toDraft(value))}
    />
  );
}
