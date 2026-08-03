import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, format, startOfDay } from "date-fns";

/**
 * Day bucketing in the user's timezone.
 *
 * Meals are stored as absolute instants (unix ms). "Today" is a question about
 * the user's wall clock, so every boundary must be computed in their zone —
 * otherwise an 11pm meal in Singapore lands on the previous day for a server
 * running in UTC.
 */

/** Whether the runtime recognises an IANA zone, so a bad value can fall back. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * The absolute instants bounding a local calendar day, as `[start, end)`.
 *
 * `end` is exclusive so range queries can use `>= start AND < end` and never
 * double-count the midnight boundary.
 */
export function dayRangeInZone(
  timeZone: string,
  reference: Date = new Date(),
): { start: Date; end: Date } {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";

  // Shift the instant into the zone's wall-clock, truncate to midnight, then
  // shift back to get the true instant that local midnight corresponds to.
  const localMidnight = startOfDay(toZonedTime(reference, zone));
  const start = fromZonedTime(localMidnight, zone);
  const end = fromZonedTime(addDays(localMidnight, 1), zone);

  return { start, end };
}

/**
 * The last `days` local days ending with the reference day, oldest first.
 * Used by the 7-day history chart.
 */
export function recentDayRanges(
  timeZone: string,
  days: number,
  reference: Date = new Date(),
): Array<{ date: string; start: Date; end: Date }> {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const localToday = startOfDay(toZonedTime(reference, zone));

  return Array.from({ length: days }, (_, index) => {
    const offset = index - (days - 1); // -(days-1) … 0
    const localDay = addDays(localToday, offset);

    return {
      // Local calendar date, so chart labels match what the user experienced.
      date: format(localDay, "yyyy-MM-dd"),
      start: fromZonedTime(localDay, zone),
      end: fromZonedTime(addDays(localDay, 1), zone),
    };
  });
}

/**
 * `yyyy-MM-dd` in the user's zone.
 *
 * The key day plans are stored under, so it must agree with `dayRangeInZone`
 * about where a day starts — both derive from the same zoned conversion.
 */
export function localDateString(
  at: Date,
  timeZone: string,
): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  return format(toZonedTime(at, zone), "yyyy-MM-dd");
}

/** `HH:mm` in the user's zone — passed to the model to infer meal type. */
export function localTimeLabel(
  timeZone: string,
  reference: Date = new Date(),
): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  return format(toZonedTime(reference, zone), "HH:mm");
}
