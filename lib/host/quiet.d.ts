/**
 * Quiet hours: the daily window and the temporary one an assistant's settings
 * hold, and where a reminder goes when its time falls inside them. Pure: settings
 * and instants in, instants out.
 *
 * A reminder that falls in quiet hours moves to the end of them when the event
 * is still ahead by then (the next morning), and otherwise to one minute before
 * they start (the evening before). The ask to write once more before the chat
 * app's reply window closes moves to half an hour before them.
 * @module dsh-assisstant/host/quiet
 */
/** What this module reads from an assistant's settings. */
export interface QuietSettings {
    /** `HH:MM`; empty, malformed, or equal to the end means no daily quiet hours. */
    readonly quietStart: string;
    readonly quietEnd: string;
    /** Epoch milliseconds; absent means from whenever it was set. */
    readonly tempQuietFrom?: number | undefined;
    readonly tempQuietUntil?: number | undefined;
}
/** A stretch of time, epoch milliseconds, end excluded. */
export interface Span {
    readonly start: number;
    readonly end: number;
}
/**
 * @param settings - the assistant's quiet hours.
 * @param at - an instant.
 * @param zone - the user's IANA zone.
 * @returns the daily window holding the instant, else the next one; undefined when there are no daily quiet hours.
 */
export declare function dailySpan(settings: QuietSettings, at: number, zone: string): Span | undefined;
/**
 * @param settings - the assistant's quiet hours.
 * @param at - an instant.
 * @param zone - the user's IANA zone.
 * @returns the quiet hours holding the instant, with overlapping kinds joined; undefined outside them.
 */
export declare function quietSpanAt(settings: QuietSettings, at: number, zone: string): Span | undefined;
/**
 * @param settings - the assistant's quiet hours.
 * @param time - a local `HH:MM`.
 * @returns whether that time of day falls in the daily quiet hours.
 */
export declare function inDailyQuiet(settings: QuietSettings, time: string): boolean;
/** How long before the chat app's reply window closes the user is asked to write once more. */
export declare const NUDGE_LEAD_MS: number;
/** How long before quiet hours that hold that moment the ask comes instead. */
export declare const NUDGE_BEFORE_QUIET_MS: number;
/**
 * When to ask the user to write once more before the chat app stops taking
 * the assistant's messages.
 * @param settings - the assistant's quiet hours.
 * @param closesAt - when the chat app's reply window closes.
 * @param zone - the user's IANA zone.
 * @returns {@link NUDGE_LEAD_MS} before it closes, or {@link NUDGE_BEFORE_QUIET_MS} before quiet hours holding that moment.
 */
export declare function nudgeAt(settings: QuietSettings, closesAt: number, zone: string): number;
/**
 * When a reminder should come.
 * @param settings - the assistant's quiet hours.
 * @param event - when the event starts.
 * @param leadMinutes - how long before it the reminder belongs.
 * @param zone - the user's IANA zone.
 * @returns the instant: its lead before the event, or moved out of quiet hours.
 */
export declare function remindAt(settings: QuietSettings, event: number, leadMinutes: number, zone: string): number;
