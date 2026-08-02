"use client";

import { useEffect, useState } from "react";

/**
 * Delays propagating a rapidly-changing value.
 *
 * Used by the history search box so typing doesn't fire a request per
 * keystroke. The timer resets on every change, so the value only settles once
 * the user pauses.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
