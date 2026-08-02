"use client";

import { useEffect, useRef } from "react";

import { useProfile, useUpdateProfile } from "@/hooks/use-meals";
import { detectBrowserTimeZone } from "@/lib/timezones";

/**
 * Adopts the browser's timezone the first time the app runs.
 *
 * "Today" is bucketed in the profile's timezone, so leaving a fresh profile on
 * the UTC default silently files evening meals under the wrong day for anyone
 * not on UTC.
 *
 * Only fires while the profile is still on the untouched default, so a zone the
 * user picked deliberately in Settings is never overwritten — including the
 * case where they genuinely want UTC while travelling.
 */
export function TimezoneSync() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile({ silent: true });
  const attempted = useRef(false);

  useEffect(() => {
    if (!profile || attempted.current) return;

    const browserZone = detectBrowserTimeZone();
    if (profile.timezone !== "UTC" || browserZone === "UTC") return;

    attempted.current = true;
    update.mutate({ timezone: browserZone });
  }, [profile, update]);

  return null;
}
