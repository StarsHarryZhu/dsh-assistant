/**
 * The calendar the model reads every assembly, the `/ddl` week window, and the
 * session projection that remembers the user's latest browser time zone.
 * Ported from assistant-mode (`my_plugins/dsh-assisstant/lib/index.js`) with a
 * projection key of its own, so both plugins can be installed together.
 * @module dsh-assisstant/host/calendar
 */
/** Session projection key holding the user's latest browser time zone. */
export declare const ZONE_KEY = "dshAssisstantTimeZone";
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
/** @returns the host process time zone. */
export declare function processZone(): string;
/**
 * Read the browser zone the host stamps on an ordinary web user message
 * (`source.clientTimeZone`, see dsh-time-context's request-zone.ts).
 * @param source - a user message's source.
 * @returns the validated zone, or undefined.
 */
export declare function clientZone(source: unknown): string | undefined;
/** State of {@link zoneProjection}. */
export interface ZoneState {
    readonly timeZone: string | null;
}
/**
 * Host-only projection: the latest valid browser zone seen in the session.
 * The fold returns the same state reference for every event it ignores.
 */
export declare const zoneProjection: {
    key: string;
    stateVersion: number;
    stateSchema: {
        parse(value: unknown): ZoneState;
    };
    init: () => ZoneState;
    apply(state: ZoneState, event: {
        type: string;
        data?: {
            source?: unknown;
        };
    }): ZoneState;
};
/**
 * The zone's local days from today on. Each day is anchored at UTC noon of
 * that calendar date, so the date arithmetic never depends on the zone.
 * @param now - the current instant.
 * @param zone - an IANA zone.
 * @param count - days after today to include.
 * @returns today and the following days.
 */
export declare function localDays(now: Date, zone: string, count: number): LocalDay[];
/** @returns the Chinese weekday of a calendar date, "YYYY-MM-DD". */
export declare function weekdayOf(iso: string): string;
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
