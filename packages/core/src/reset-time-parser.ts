import { DateTime } from 'luxon';

/** Matches "9:30pm", "3pm", "11:00 AM" — 12-hour clock with optional minutes. */
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/i;

/** Matches an IANA timezone in parentheses, e.g. "(Pacific/Auckland)". */
const TZ_RE = /\(([A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)\)/;

/**
 * Find a clock time (and optional IANA timezone) in `text` and return the next
 * future occurrence of it, as epoch milliseconds, relative to `now`.
 *
 * - No timezone in the text -> the system local zone.
 * - An unknown timezone -> falls back to the system local zone.
 * - If today's occurrence has already passed, the next day is used.
 * Returns null when no valid clock time is found.
 */
export function parseResetTime(text: string, now: Date): number | null {
  const m = TIME_RE.exec(text);
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]!.toLowerCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (hour === 12) hour = 0;
  if (meridiem === 'p') hour += 12;

  const tzMatch = TZ_RE.exec(text);
  const zone = tzMatch?.[1];

  // Build "now" in the target zone; fall back to local if the zone is unknown.
  let nowDt = zone ? DateTime.fromJSDate(now, { zone }) : DateTime.fromJSDate(now);
  if (!nowDt.isValid) nowDt = DateTime.fromJSDate(now);

  let target = nowDt.set({ hour, minute, second: 0, millisecond: 0 });
  if (target.toMillis() <= nowDt.toMillis()) target = target.plus({ days: 1 });

  return target.toMillis();
}
