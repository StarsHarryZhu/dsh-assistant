/**
 * Edits of `ddl.md` behind the calendar tools: local dates and times come in,
 * UTC lines go out, and the file is pruned on every write. Pure: text in, text
 * out. The line formats are ddl.ts's.
 * @module dsh-assisstant/host/records/calendar
 */
import type { DdlEntry, RepeatRule } from '../ddl.ts';
export declare const CALENDAR_FILE = "ddl.md";
export type RepeatName = RepeatRule['kind'];
/** A new item, in the user's local time. */
export interface CalendarItem {
    readonly title: string;
    readonly kind: string;
    readonly note?: string | undefined;
    readonly date?: string | undefined;
    readonly time?: string | undefined;
    readonly endDate?: string | undefined;
    readonly endTime?: string | undefined;
    readonly repeat?: RepeatName | undefined;
    /** ISO weekdays of a weekly repeat; defaults to the weekday of `date`. */
    readonly weekdays?: readonly number[] | undefined;
}
/** What to do to an item found by its title. */
export type CalendarAction = 'change' | 'done' | 'reopen' | 'remove';
/** An edit of an existing item. Omitted fields keep their values. */
export interface CalendarEdit extends Partial<CalendarItem> {
    readonly match: string;
    /** A local date that narrows the match when several items share a title. */
    readonly on?: string | undefined;
    readonly action: CalendarAction;
}
/** The outcome: the new text and the entries before and after, or why not. */
export type CalendarResult = {
    readonly ok: true;
    readonly text: string;
    readonly entry?: DdlEntry;
    readonly previous?: DdlEntry;
} | {
    readonly ok: false;
    readonly message: string;
};
/** @returns the first thing wrong with the given dates and times, if any. */
export declare function invalidTiming(item: Partial<CalendarItem>): string | undefined;
/**
 * Add an item.
 * @param text - the file, undefined when absent.
 * @param item - the new item.
 * @param now - the current instant.
 * @param zone - the user's IANA zone.
 * @returns the outcome.
 */
export declare function addItem(text: string | undefined, item: CalendarItem, now: number, zone: string): CalendarResult;
/**
 * Change, finish, reopen, or remove an item found by its title.
 * @param text - the file, undefined when absent.
 * @param edit - which item and what to do.
 * @param now - the current instant.
 * @param zone - the user's IANA zone.
 * @returns the outcome.
 */
export declare function updateItem(text: string | undefined, edit: CalendarEdit, now: number, zone: string): CalendarResult;
/**
 * @param entry - an entry.
 * @param zone - the user's IANA zone.
 * @returns whether it has a clock time a reminder can lead: not all day, and
 * not a date-only deadline stored as 23:59.
 */
export declare function hasClockTime(entry: DdlEntry, zone: string): boolean;
