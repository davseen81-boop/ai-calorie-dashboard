"use client";

import { createContext, useContext, useMemo, useState } from "react";

/**
 * The day the dashboard is currently showing.
 *
 * Lives above both because the two halves are in different places: the
 * dashboard chooses the date, but the log button sits in the app shell. Without
 * this, stepping back to yesterday and tapping "Log meal" would file the food
 * under today — a silent wrong answer, which is worse than not offering the
 * navigation at all.
 *
 * `null` means today, so the common case needs no date handling anywhere.
 */
interface ViewedDateValue {
  /** Local `yyyy-MM-dd`, or null for today. */
  date: string | null;
  setDate: (date: string | null) => void;
}

const ViewedDateContext = createContext<ViewedDateValue>({
  date: null,
  setDate: () => {},
});

export function useViewedDate(): ViewedDateValue {
  return useContext(ViewedDateContext);
}

export function ViewedDateProvider({ children }: { children: React.ReactNode }) {
  const [date, setDate] = useState<string | null>(null);
  const value = useMemo(() => ({ date, setDate }), [date]);

  return (
    <ViewedDateContext.Provider value={value}>
      {children}
    </ViewedDateContext.Provider>
  );
}
