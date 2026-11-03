/**
 * Logs: dated entries that pile up and keep their history (`logs/<名>.md`):
 * blood pressure, weight, expenses. Times are the user's own clock.
 * @module dsh-assisstant/host/records/logs
 */
export declare const LOGS_FOLDER = "logs";
/** One log entry. */
export interface LogEntry {
    readonly at: string;
    readonly text: string;
}
/** @returns every entry of the file, oldest first. */
export declare function readLog(text: string): LogEntry[];
/**
 * Add an entry in time order, or replace the latest one.
 * @param text - the file, undefined when absent.
 * @param name - the log's name.
 * @param entry - the text and its "YYYY-MM-DD HH:MM".
 * @param replaceLast - replace the latest entry instead of adding one.
 * @returns the new text.
 */
export declare function addLogEntry(text: string | undefined, name: string, entry: LogEntry, replaceLast: boolean): string;
