/**
 * What the assistant conversation knows of DeepSeek's peak hours: when they
 * are in the user's own time, and whether one is on now, so work that can
 * wait waits for the off-peak price (see "Off-peak work" in the router
 * prompt).
 * @module dsh-assisstant/host/off-peak
 */
import { formatPeakHours, peakSpanAt, upcomingPeaks } from "../shared/peak.js";
import { local, whenText } from "./calendar.js";
/** How many coming stretches the context lists. */
const LISTED = 3;
/**
 * The peak-hours lines of the conversation's context.
 * @param windows - the peak hours, Beijing time, Monday to Friday.
 * @param now - epoch milliseconds.
 * @param zone - the user's IANA zone.
 */
export function offPeakText(windows, now, zone) {
    const current = peakSpanAt(windows, now);
    const coming = upcomingPeaks(windows, now, LISTED + (current === undefined ? 0 : 1)).filter(span => span.start > now);
    const lines = [
        '# DeepSeek peak hours',
        '',
        `- DeepSeek's API costs twice as much in its peak hours: Monday to Friday, ${formatPeakHours(windows).replaceAll(',', ' and ').replaceAll('-', '–')} Beijing time. The rest of the time, weekends included, is off-peak.`,
        current === undefined
            ? `- Now: off-peak${coming[0] === undefined ? '' : `; the next peak hours start ${whenText(coming[0].start, zone)}`}.`
            : `- Now: peak hours, until ${whenText(current.end, zone)}.`,
    ];
    if (coming.length > 0) {
        lines.push(`- Coming peak hours in the user's time: ${coming.slice(0, LISTED).map(span => `${whenText(span.start, zone)}–${local(span.end, zone).time}`).join(', ')}.`);
    }
    lines.push('- Follow "Off-peak work" in your instructions.');
    return lines.join('\n');
}
