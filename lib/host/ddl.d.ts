/**
 * The fast path over `ddl.md`: parse the schedule file and render it in the
 * user's time zone without calling a model. The router reads the
 * result as inline context, `/ddl` shows it directly, the daily brief decides
 * from it whether there is anything to say today, and the calendar tools
 * (records/calendar.ts) edit the file with these same shapes.
 *
 * Line formats:
 * - one item: `- [ ] 2026-10-28T18:00Z · 日程 · 标题（备注）`, a span
 *   `start – end`, or `无日期` for the time; a done line starts `- [x]` and ends
 *   `（完成 …）`. Times are UTC.
 * - a repeating item: `- 每周一三 19:00 · 日程 · 标题`, with 每天, 每周<days>,
 *   每月<n>日, or 每年<m>月<n>日, and an optional time in the user's
 *   own clock, so it follows them across zones.
 * @module dsh-assisstant/host/ddl
 */
/** How an item repeats. Weekdays are ISO: Monday 1 through Sunday 7. */
export type RepeatRule = {
    readonly kind: 'daily';
} | {
    readonly kind: 'weekly';
    readonly weekdays: readonly number[];
} | {
    readonly kind: 'monthly';
    readonly day: number;
} | {
    readonly kind: 'yearly';
    readonly month: number;
    readonly day: number;
};
/** A repeating item's rule and its optional local `HH:MM`. */
export interface Repeat {
    readonly rule: RepeatRule;
    readonly time?: string;
}
/** One parsed line of `ddl.md`. */
export interface DdlEntry {
    readonly done: boolean;
    /** Start (or the only time), epoch ms; undefined for an undated or repeating entry. */
    readonly start?: number;
    /** End of a span, epoch ms. */
    readonly end?: number;
    /** Set on a repeating entry, which is never done. */
    readonly repeat?: Repeat;
    /** `DDL`, `日程`, or `项目` (anything else is read as DDL). */
    readonly kind: string;
    readonly title: string;
}
/** @returns how a repeat rule reads in the file and to the user: "每周一三". */
export declare function ruleText(rule: RepeatRule): string;
/**
 * @param rule - a repeat rule.
 * @param iso - a local date, "YYYY-MM-DD".
 * @returns whether the rule falls on that date. A day the month does not have is skipped.
 */
export declare function repeatsOn(rule: RepeatRule, iso: string): boolean;
/**
 * Parse `ddl.md`.
 * @param text - the file.
 * @returns every well-formed entry in file order; other lines are skipped.
 */
export declare function parseDdl(text: string): DdlEntry[];
/** One instant in a zone. */
interface LocalTime {
    readonly iso: string;
    readonly short: string;
    readonly time: string;
}
/** @returns the zone's date and 24-hour time at that instant. */
export declare function local(ms: number, zone: string): LocalTime;
/**
 * The instant of a local date and time. A time a clock change repeats reads as
 * the earlier one; a time it skips moves forward by the gap.
 * @param date - "YYYY-MM-DD".
 * @param time - "HH:MM".
 * @param zone - an IANA zone.
 * @returns epoch milliseconds.
 */
export declare function zonedToUtc(date: string, time: string, zone: string): number;
/**
 * The plain-text week view `/ddl` shows: one block per day, then undated
 * items, items done this week, and how many open items come later.
 * @param entries - the parsed file.
 * @param now - the current instant.
 * @param zone - the user's IANA zone.
 * @returns Markdown.
 */
export declare function weekView(entries: readonly DdlEntry[], now: Date, zone: string): string;
/**
 * @param entry - a one-off entry with a start.
 * @param zone - the user's IANA zone.
 * @returns whether it is a whole-day 日程, stored as 00:00–23:59 local.
 */
export declare function isAllDay(entry: DdlEntry, zone: string): boolean;
/**
 * One entry on one line, in the user's time, as tool results and
 * searches show it: "11/05 周四 14:30 · 日程 · 看牙医".
 * @param entry - the entry.
 * @param zone - the user's IANA zone.
 * @returns the line.
 */
export declare function describeEntry(entry: DdlEntry, zone: string): string;
/**
 * Today's open items, as the daily brief lists them. Items repeating every day
 * stay out: they have their own reminders, and would make every day a brief day.
 * @param entries - the parsed file.
 * @param now - the current instant.
 * @param zone - the user's IANA zone.
 * @returns one label per item, empty when today is free.
 */
export declare function todayItems(entries: readonly DdlEntry[], now: Date, zone: string): string[];
export {};
