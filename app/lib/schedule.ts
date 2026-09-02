// Bridges the calendar's plain `scheduled_date` (a day) to the publisher's
// `scheduled_time` (an instant).
//
// The dispatcher gates on `.lte('scheduled_time', now)` and a NULL never
// matches, so any row written with only a date is skipped on every tick,
// silently and forever. Everything that writes `scheduled_date` must also
// derive `scheduled_time` through here.

/** Default posting hour, in Europe/London local time. */
export const DEFAULT_POST_HOUR_LONDON = 9;

/**
 * Offset in minutes that Europe/London is ahead of UTC at the given instant.
 * Derived from the IANA database via Intl rather than hardcoded, so BST/GMT
 * transitions are handled without a DST table of our own.
 */
function londonOffsetMinutes(instant: Date): number {
  // 'en-CA' gives an ISO-ordered YYYY-MM-DD, which parses back unambiguously.
  const asLondon = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(instant);

  const [datePart, timePart] = asLondon.split(', ');
  // Intl renders midnight as 24:00:00 in some runtimes; normalise to 00:00:00.
  const wallClock = new Date(`${datePart}T${timePart.replace(/^24:/, '00:')}Z`);
  return Math.round((wallClock.getTime() - instant.getTime()) / 60000);
}

/**
 * Convert a `YYYY-MM-DD` calendar day into the UTC instant of `hour` o'clock
 * London time on that day.
 *
 * 09:00 London is 08:00Z under BST and 09:00Z under GMT.
 *
 * Returns null for empty or malformed input so a bad value can never be
 * written as a real timestamp.
 */
export function londonTimeToUtcIso(
  scheduledDate: string | null | undefined,
  hour: number = DEFAULT_POST_HOUR_LONDON
): string | null {
  if (!scheduledDate) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledDate.trim());
  if (!match) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;

  const [, y, m, d] = match;
  const year = Number(y), month = Number(m), day = Number(d);

  // First guess: treat the wall clock as if it were UTC.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  if (Number.isNaN(guess.getTime())) return null;

  // Reject dates the calendar rolled over (e.g. 2026-02-31 -> 3 March).
  if (guess.getUTCMonth() !== month - 1 || guess.getUTCDate() !== day) return null;

  // Subtract London's offset to land on the true instant, then re-measure:
  // near a DST boundary the offset at the guess can differ from the offset at
  // the result, and the second pass settles it.
  const firstPass = new Date(guess.getTime() - londonOffsetMinutes(guess) * 60000);
  const settled = new Date(guess.getTime() - londonOffsetMinutes(firstPass) * 60000);

  return settled.toISOString();
}
