/**
 * DeepSeek's peak hours: when its API costs twice what it costs the rest of
 * the time. They are set in Beijing time, Monday to Friday; weekends are off
 * peak all day. Beijing keeps no daylight saving time, so its clock is UTC+8
 * all year. Chinese public holidays are off peak too, but they move every
 * year and are not tracked: one counts as a working day, which only means
 * that work waits a few hours longer than it had to.
 * @module dsh-assisstant/shared/peak
 */
/** DeepSeek's peak hours as its price page gives them (2026-08). */
export const DEFAULT_PEAK_HOURS = '09:00-12:00,14:00-18:00';
/** Beijing time's offset from UTC. */
const BEIJING_MS = 8 * 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** @returns minutes after midnight for `HH:MM` (24:00 allowed), or undefined. */
function minutesOf(text) {
    const match = /^(\d{1,2}):(\d{2})$/u.exec(text.trim());
    if (match === null)
        return undefined;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0))
        return undefined;
    return hour * 60 + minute;
}
/** @returns minutes after midnight as `HH:MM`. */
function clockOf(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
/**
 * Read peak hours written as `HH:MM-HH:MM`, comma separated.
 * @param text - the setting; empty means none.
 * @returns the windows in order, empty for none, or undefined when the text is not peak hours.
 */
export function parsePeakHours(text) {
    if (text.trim() === '')
        return [];
    const windows = [];
    for (const part of text.split(/[,，]/u)) {
        const [from, to, extra] = part.split(/[-–~]/u);
        if (from === undefined || to === undefined || extra !== undefined)
            return undefined;
        const start = minutesOf(from);
        const end = minutesOf(to);
        if (start === undefined || end === undefined || start >= end)
            return undefined;
        windows.push({ start, end });
    }
    return windows.sort((a, b) => a.start - b.start);
}
/** @returns the windows written back, as the setting stores them. */
export function formatPeakHours(windows) {
    return windows.map(window => `${clockOf(window.start)}-${clockOf(window.end)}`).join(',');
}
/**
 * The peak stretch an instant falls in.
 * @param windows - the peak hours.
 * @param at - epoch milliseconds.
 * @returns its start and end, epoch milliseconds, or undefined off peak.
 */
export function peakSpanAt(windows, at) {
    const shifted = at + BEIJING_MS;
    const day = new Date(shifted).getUTCDay();
    if (day === 0 || day === 6)
        return undefined;
    const midnight = shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS);
    const minute = (shifted - midnight) / MINUTE_MS;
    const window = windows.find(entry => minute >= entry.start && minute < entry.end);
    if (window === undefined)
        return undefined;
    return { start: midnight - BEIJING_MS + window.start * MINUTE_MS, end: midnight - BEIJING_MS + window.end * MINUTE_MS };
}
/**
 * @returns the first instant at or after `at` that is off peak: `at` itself
 * off peak, else the end of its stretch, past stretches that meet.
 */
export function offPeakFrom(windows, at) {
    let next = at;
    for (let step = 0; step < 16; step += 1) {
        const span = peakSpanAt(windows, next);
        if (span === undefined)
            return next;
        next = span.end;
    }
    return next;
}
/**
 * The peak stretches still to come, the one under way included.
 * @param windows - the peak hours.
 * @param at - epoch milliseconds.
 * @param count - how many.
 * @returns up to `count` stretches ending after `at`, in order.
 */
export function upcomingPeaks(windows, at, count) {
    const spans = [];
    if (windows.length === 0)
        return spans;
    const shifted = at + BEIJING_MS;
    const midnight = shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS);
    for (let offset = 0; offset < 14 && spans.length < count; offset += 1) {
        const day = midnight + offset * DAY_MS;
        const weekday = new Date(day).getUTCDay();
        if (weekday === 0 || weekday === 6)
            continue;
        for (const window of windows) {
            const start = day - BEIJING_MS + window.start * MINUTE_MS;
            const end = day - BEIJING_MS + window.end * MINUTE_MS;
            if (end > at && spans.length < count)
                spans.push({ start, end });
        }
    }
    return spans;
}
