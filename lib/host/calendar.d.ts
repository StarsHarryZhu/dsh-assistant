/**
 * Time in the user's own zone (recorded in the profile, never read from a
 * browser): the zone primitives every host module shares (an instant's local
 * date and time, a local time's instant, date arithmetic, the `HH:MM` shape),
 * the calendar the model reads every assembly, the clock it gets every few
 * minutes, and the `/ddl` week window. Ported from assistant-mode
 * (`my_plugins/dsh-assisstant/lib/index.js`).
 * @module dsh-assisstant/host/calendar
 */
/** One local day of the calendar. */
export interface LocalDay {
    readonly iso: string;
    readonly short: string;
    readonly weekday: string;
    readonly offset: string;
}
/**
 * @param value - a candidate IANA zone name.
 * @returns the name when the runtime accepts it unchanged, else undefined.
 */
export declare function validZone(value: unknown): string | undefined;
/** @returns the host process time zone: only a stand-in until the user's zone is recorded. */
export declare function processZone(): string;
/** A 24-hour clock time, `HH:MM`. */
export declare const CLOCK_TIME: RegExp;
/** One instant in a zone. */
export interface LocalTime {
    /** "YYYY-MM-DD". */
    readonly iso: string;
    /** "MM/DD". */
    readonly short: string;
    /** "HH:MM", 24-hour. */
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
/** @returns the calendar date that many days away from "YYYY-MM-DD". */
export declare function addDays(date: string, days: number): string;
/**
 * The zone's local days from today on. Each day is anchored at UTC noon of
 * that calendar date, so the date arithmetic never depends on the zone.
 * @param now - the current instant.
 * @param zone - an IANA zone.
 * @param count - days after today to include.
 * @returns today and the following days.
 */
export declare function localDays(now: Date, zone: string, count: number): LocalDay[];
/**
 * The clock reading the model gets, in place of the host's own, which only knows
 * the browser's and the device's zones.
 * @param now - the current instant.
 * @param zone - the user's current IANA zone.
 * @returns one line.
 */
export declare function clockText(now: Date, zone: string): string;
/** @returns the Chinese weekday of a calendar date, "YYYY-MM-DD". */
export declare function weekdayOf(iso: string): string;
/** @returns an instant in the zone as "11/05 周四 14:30". */
export declare function whenText(ms: number, zone: string): string;
/** @returns the /ddl window, as "10/26 周一 – 11/01 周日". */
export declare function weekLabel(now: Date, zone: string): string;
/**
 * The calendar context. It changes only when the local date or the zone
 * changes, so it adds no snapshot per step.
 * @param now - the current instant.
 * @param zone - the user's current IANA zone.
 * @returns the context text.
 */
export declare function calendarText(now: Date, zone: string): string;
