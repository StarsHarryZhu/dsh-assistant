/**
 * Quiet hours: the daily window and the temporary one an assistant's settings
 * hold, and where a reminder goes when its time falls inside them. Pure: settings
 * and instants in, instants out.
 *
 * A reminder that falls in quiet hours moves to the end of them when the event
 * is still ahead by then (the next morning), and otherwise to one minute before
 * they start (the evening before).
 * @module dsh-assisstant/host/quiet
 */
import { zonedToUtc, local } from "./ddl.js";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;
/** How many times two kinds of quiet hours can chain into each other. */
const MAX_CHAIN = 4;
/** One minute. */
const MINUTE_MS = 60_000;
/** @returns the date that many days away. */
function addDays(date, days) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
/**
 * @param settings - the assistant's quiet hours.
 * @param at - an instant.
 * @param zone - the user's IANA zone.
 * @returns the daily window holding the instant, else the next one; undefined when there are no daily quiet hours.
 */
export function dailySpan(settings, at, zone) {
    const { quietStart: start, quietEnd: end } = settings;
    if (!TIME.test(start) || !TIME.test(end) || start === end)
        return undefined;
    const today = local(at, zone).iso;
    for (const offset of [-1, 0, 1]) {
        const day = addDays(today, offset);
        const span = { start: zonedToUtc(day, start, zone), end: zonedToUtc(end > start ? day : addDays(day, 1), end, zone) };
        if (at < span.end)
            return span;
    }
    return undefined;
}
/** @returns the temporary quiet hours, whatever the time; undefined when none are set. */
function temporarySpan(settings) {
    const { tempQuietFrom: start, tempQuietUntil: end } = settings;
    return end === undefined ? undefined : { start: start ?? 0, end };
}
/** @returns the spans holding the instant. */
function spansAt(settings, at, zone) {
    return [dailySpan(settings, at, zone), temporarySpan(settings)]
        .filter((span) => span !== undefined && span.start <= at && at < span.end);
}
/**
 * @param settings - the assistant's quiet hours.
 * @param at - an instant.
 * @param zone - the user's IANA zone.
 * @returns the quiet hours holding the instant, with overlapping kinds joined; undefined outside them.
 */
export function quietSpanAt(settings, at, zone) {
    const first = spansAt(settings, at, zone);
    if (first.length === 0)
        return undefined;
    let start = Math.min(...first.map(span => span.start));
    let end = Math.max(...first.map(span => span.end));
    for (let step = 0; step < MAX_CHAIN; step += 1) {
        const before = spansAt(settings, start - 1, zone);
        const after = spansAt(settings, end, zone);
        if (before.length === 0 && after.length === 0)
            break;
        start = Math.min(start, ...before.map(span => span.start));
        end = Math.max(end, ...after.map(span => span.end));
    }
    return { start, end };
}
/**
 * @param settings - the assistant's quiet hours.
 * @param time - a local `HH:MM`.
 * @returns whether that time of day falls in the daily quiet hours.
 */
export function inDailyQuiet(settings, time) {
    const { quietStart: start, quietEnd: end } = settings;
    if (!TIME.test(start) || !TIME.test(end) || start === end)
        return false;
    return start < end ? start <= time && time < end : time >= start || time < end;
}
/**
 * When a reminder should come.
 * @param settings - the assistant's quiet hours.
 * @param event - when the event starts.
 * @param leadMinutes - how long before it the reminder belongs.
 * @param zone - the user's IANA zone.
 * @returns the instant: its lead before the event, or moved out of quiet hours.
 */
export function remindAt(settings, event, leadMinutes, zone) {
    const wanted = event - leadMinutes * MINUTE_MS;
    const span = quietSpanAt(settings, wanted, zone);
    if (span === undefined)
        return wanted;
    return event >= span.end ? span.end : span.start - MINUTE_MS;
}
