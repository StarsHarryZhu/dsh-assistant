/**
 * The heartbeat: everything an assistant does on its own, without the host's
 * automation tasks. Checked once a minute per assistant, it wakes the assistant
 * conversation with one note when something is due:
 *
 * - the daily brief at its set time, every day, even when today is free;
 * - a timed item's reminder at its lead time, read from `ddl.md` each time, so a
 *   changed or cancelled item needs nothing kept in step;
 * - a wake-up the model set for itself (`wake_after`);
 * - the heartbeat itself every `heartbeatMinutes`, which reaches the model only
 *   while `heartbeatIdleWake` is on when nothing else is due.
 *
 * Inside quiet hours nothing fires but a wake-up the user asked to come through
 * them; a reply routed to the chat app in them waits in im-robot's outbox
 * until they end. Once a day it also has old files of the chat inbox removed.
 * Each assistant's state is a file in the plugin's data folder, so a restart
 * repeats nothing and misses nothing that is still ahead.
 * @module dsh-assisstant/host/heartbeat
 */
import type { Person } from '../shared/settings.ts';
import type { ScheduleLike } from './types.ts';
/**
 * Remove a session's automation tasks, which earlier versions used for reminders and the heartbeat replaces.
 * Each change is made as that session, so its own agent is not told about it.
 * @param schedule - the host's schedule service, in either shape.
 * @param sessionId - the assistant conversation.
 */
export declare function clearAutomationTasks(schedule: ScheduleLike, sessionId: string): Promise<void>;
/** A time the model asked to be woken. */
export interface WakeRequest {
    readonly id: string;
    /** Epoch milliseconds. */
    readonly at: number;
    readonly reason: string;
    /** The user asked for exactly this moment, so quiet hours do not hold it back. */
    readonly throughQuiet: boolean;
}
/** What the heartbeat needs from the plugin. */
export interface HeartbeatDeps {
    now(): number;
    people(): readonly Person[];
    /** The user's IANA zone. */
    zoneFor(person: Person): string;
    /** A file's text, undefined when absent. */
    read(path: string): string | undefined;
    /** Whether the assistant conversation is running a turn. */
    running(sessionId: string): boolean;
    /** Whether a chat app is connected and switched on for this assistant. */
    chatConnected(person: Person): boolean;
    /** Send a note into the assistant conversation. */
    sendNote(sessionId: string, text: string): void;
    /** Remove the assistant's old chat inbox files; called once a day. */
    prune?(person: Person): void;
    warn(message: string): void;
    /** The folder of the state files. */
    directory: string;
}
/** Most wake-ups one assistant may have waiting. */
export declare const MAX_WAKES = 50;
/** What one note says. */
export interface NoteParts {
    readonly now: number;
    readonly zone: string;
    /** When the next heartbeat comes, or undefined when they are off. */
    readonly nextBeat: number | undefined;
    /** Set for the daily brief: today's labels, empty when today is free. */
    readonly brief?: readonly string[] | undefined;
    /** Reminders due now: "11/05 周四 14:30 · 日程 · 看牙医". */
    readonly reminders: readonly string[];
    readonly wakes: readonly WakeRequest[];
    /** Whether a chat app is connected. */
    readonly chat: boolean;
    /** Whether quiet hours are on now, which only a wake-up the user asked for comes through. */
    readonly inQuiet: boolean;
}
/**
 * The note that wakes an assistant. In English: only the model reads it.
 * @param parts - what is due.
 * @returns the system note.
 */
export declare function heartbeatText(parts: NoteParts): string;
/** Decides, per assistant and per minute, whether to wake it. */
export declare class Heartbeat {
    private readonly deps;
    private readonly states;
    constructor(deps: HeartbeatDeps);
    private pathOf;
    private stateOf;
    private save;
    /** @returns the wake-ups an assistant has waiting, soonest first. */
    wakes(personId: string): readonly WakeRequest[];
    /**
     * Add a wake-up.
     * @returns the new wake-up, or undefined when too many are waiting.
     */
    addWake(personId: string, wake: Omit<WakeRequest, 'id'>): WakeRequest | undefined;
    /**
     * Remove the wake-ups whose reason contains the words.
     * @returns those removed.
     */
    cancelWakes(personId: string, match: string): WakeRequest[];
    /** Forget a removed assistant. */
    forget(personId: string): void;
    /**
     * Check every assistant; call this once a minute.
     * @returns the session ids woken.
     */
    tick(): string[];
    private tickOne;
    /** Store the state, forgetting reminders of events long past. */
    private saveQuietly;
    /** @returns when the next heartbeat will fire: after quiet hours when it falls inside them. */
    private nextBeat;
    /** @returns the reminders whose time has come since the last look. */
    private dueReminders;
}
