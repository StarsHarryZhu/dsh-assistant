/**
 * Logs: dated entries that pile up and keep their history (`logs/<名>.md`):
 * blood pressure, weight, expenses. Times are the user's own clock.
 * @module dsh-assisstant/host/records/logs
 */
import { joinLines, lastIndexWhere, linesOf, oneLine } from "./text.js";
export const LOGS_FOLDER = 'logs';
const LINE = /^- (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (.*)$/u;
/** @returns every entry of the file, oldest first. */
export function readLog(text) {
    return linesOf(text).flatMap((line) => {
        const match = LINE.exec(line.trim());
        return match === null ? [] : [{ at: match[1], text: match[2] }];
    });
}
/**
 * Add an entry in time order, or replace the latest one.
 * @param text - the file, undefined when absent.
 * @param name - the log's name.
 * @param entry - the text and its "YYYY-MM-DD HH:MM".
 * @param replaceLast - replace the latest entry instead of adding one.
 * @returns the new text.
 */
export function addLogEntry(text, name, entry, replaceLast) {
    const lines = linesOf(text ?? `# ${name}\n`);
    if (replaceLast) {
        const last = lastIndexWhere(lines, line => LINE.test(line.trim()));
        if (last >= 0)
            lines.splice(last, 1);
    }
    const line = `- ${entry.at} · ${oneLine(entry.text)}`;
    const later = lines.findIndex((existing) => {
        const at = LINE.exec(existing.trim())?.[1];
        return at !== undefined && at > entry.at;
    });
    if (later >= 0) {
        lines.splice(later, 0, line);
        return joinLines(lines);
    }
    const last = lastIndexWhere(lines, existing => LINE.test(existing.trim()));
    if (last < 0)
        lines.push('', line);
    else
        lines.splice(last + 1, 0, line);
    return joinLines(lines);
}
