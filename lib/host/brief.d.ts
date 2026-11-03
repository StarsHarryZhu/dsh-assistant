/**
 * The daily brief: once a day at their assistant's local time, a family member
 * whose `ddl.md` has open items today gets a short reminder from their
 * conversation. The decision is the fast path (the parsed file, no model):
 * a free day sends nothing and costs nothing. The day each person was last
 * handled is stored, so a restart never sends a second brief.
 * @module dsh-assisstant/host/brief
 */
import type { Person } from '../shared/settings.ts';
/** What the brief needs from the plugin. */
export interface BriefDeps {
    now(): Date;
    /** This person's `HH:MM`, or an empty string when their brief is off. */
    time(person: Person): string;
    people(): readonly Person[];
    /** The person's current IANA zone. */
    zoneFor(person: Person): string;
    /** Read a file, undefined when absent. */
    read(path: string): string | undefined;
    /** Send the brief note into the person's conversation. */
    send(sessionId: string, text: string): void;
    /** Where the handled days are stored. */
    statePath: string;
}
/**
 * The note a brief sends.
 * @param items - today's labels.
 * @returns the system note.
 */
export declare function briefText(items: readonly string[]): string;
/** Sends each person's brief once a day. */
export declare class DailyBrief {
    private readonly deps;
    private handled;
    constructor(deps: BriefDeps);
    /** @returns person id → the local date last handled. */
    private load;
    private save;
    /**
     * Check every person once; call this every minute.
     * @returns the session ids a brief was sent to.
     */
    tick(): string[];
}
