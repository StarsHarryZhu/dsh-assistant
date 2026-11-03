/**
 * Looking up what is recorded: one category or all of them, by name, date
 * range, or keywords, with schedule times in the family member's own clock.
 * @module dsh-assisstant/host/records/recall
 */
import type { RecordStore } from './store.ts';
/** The categories a lookup can name. */
export declare const RECALL_KINDS: readonly ["calendar", "list", "memo", "log", "project"];
/** One category. */
export type RecallKind = (typeof RECALL_KINDS)[number];
/** What to look up. */
export interface RecallQuery {
    readonly kind?: RecallKind | undefined;
    /** A list's, log's, or project's name. */
    readonly name?: string | undefined;
    /** Keywords; a line must contain all of them. */
    readonly query?: string | undefined;
    /** Local dates, "YYYY-MM-DD", for the schedule and logs. */
    readonly from?: string | undefined;
    readonly to?: string | undefined;
}
/**
 * Look something up.
 * @param store - the family member's records.
 * @param query - what to look up.
 * @param zone - the family member's IANA zone.
 * @param now - the current instant.
 * @returns plain text for the model.
 */
export declare function recall(store: RecordStore, query: RecallQuery, zone: string, now: number): string;
