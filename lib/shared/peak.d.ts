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
export declare const DEFAULT_PEAK_HOURS = "09:00-12:00,14:00-18:00";
/** One stretch of peak hours, in minutes after midnight, Beijing time. */
export interface PeakWindow {
    readonly start: number;
    /** After `start`; 1440 for midnight. */
    readonly end: number;
}
/**
 * Read peak hours written as `HH:MM-HH:MM`, comma separated.
 * @param text - the setting; empty means none.
 * @returns the windows in order, empty for none, or undefined when the text is not peak hours.
 */
export declare function parsePeakHours(text: string): PeakWindow[] | undefined;
/** @returns the windows written back, as the setting stores them. */
export declare function formatPeakHours(windows: readonly PeakWindow[]): string;
/**
 * The peak stretch an instant falls in.
 * @param windows - the peak hours.
 * @param at - epoch milliseconds.
 * @returns its start and end, epoch milliseconds, or undefined off peak.
 */
export declare function peakSpanAt(windows: readonly PeakWindow[], at: number): {
    readonly start: number;
    readonly end: number;
} | undefined;
/**
 * @returns the first instant at or after `at` that is off peak: `at` itself
 * off peak, else the end of its stretch, past stretches that meet.
 */
export declare function offPeakFrom(windows: readonly PeakWindow[], at: number): number;
/**
 * The peak stretches still to come, the one under way included.
 * @param windows - the peak hours.
 * @param at - epoch milliseconds.
 * @param count - how many.
 * @returns up to `count` stretches ending after `at`, in order.
 */
export declare function upcomingPeaks(windows: readonly PeakWindow[], at: number, count: number): Array<{
    readonly start: number;
    readonly end: number;
}>;
