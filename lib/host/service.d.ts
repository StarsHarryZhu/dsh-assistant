/**
 * The `dshAssisstant` service the settings row provides to the preset's
 * plugins (policy and compactor), plus the serialized settings writer the row
 * uses to store what the host finds out.
 * @module dsh-assisstant/host/service
 */
import type { AssistantSettings, Person, WorkerModel } from '../shared/settings.ts';
import type { BalanceState } from './balance.ts';
import type { WakeRequest } from './heartbeat.ts';
import type { SessionControllerLike, SessionLike, SettingsLike } from './types.ts';
/** The settings every assistant shares, as plain values. Each assistant's own are on its assistant list entry. */
export interface SharedSettings {
    readonly compactRatio: number;
    /** The models a worker may run; the assistant conversation picks one per task. */
    readonly workerModels: readonly WorkerModel[];
    readonly balanceThreshold: number;
    readonly balanceCheckMinutes: number;
    readonly balanceReminder: string;
    readonly personaSelfCorrect: boolean;
    readonly personaCooldownHours: number;
    readonly personaMaxChars: number;
    readonly profileMaxChars: number;
}
/**
 * Wrap a host event listener so a failure in it stays in this plugin. Many of
 * these fire for every session of the host, so what escapes one can make every
 * conversation unusable. Each listener logs its first failure only.
 * @param warn - where the failure goes.
 * @param label - what the listener is, for the log.
 * @param listener - the listener, which may be async.
 * @returns the listener, never throwing or rejecting.
 */
export declare function guarded<A extends unknown[]>(warn: (message: string) => void, label: string, listener: (...args: A) => unknown): (...args: A) => void;
/**
 * Send a host note into an assistant conversation as a turn of its own, resuming a
 * cold session. Its source is not `user`, so the host's conversation view draws
 * one folded notice instead of the user's own words, and session
 * titles ignore it; im-robot counts the turn as a follow-up and pushes the
 * answer to WeChat.
 * @param controller - the session controller.
 * @param sessionId - the assistant conversation.
 * @param text - the note.
 */
export declare function sendHostNote(controller: Pick<SessionControllerLike, 'resolveAgent'>, sessionId: string, text: string): Promise<void>;
/** Where a session's latest user input came from. */
export type InputChannel = 'web' | 'wechat';
/** What became of a message for the user's chat app. */
export type ChatOutcome = {
    readonly status: 'sent';
}
/** Quiet hours are on, so the host sends it when they end. */
 | {
    readonly status: 'held';
    readonly until: number;
}
/** No chat app is connected and switched on. */
 | {
    readonly status: 'unavailable';
};
/** The service. */
export interface AssistantService {
    settings(): SharedSettings;
    people(): readonly Person[];
    personForSession(sessionId: string): Person | undefined;
    balance(): BalanceState;
    refreshBalance(): Promise<BalanceState>;
    lastInput(sessionId: string): InputChannel;
    markInput(sessionId: string, channel: InputChannel): void;
    /** The user's IANA zone: what the profile records, else this computer's as a stand-in. */
    zoneFor(session: SessionLike | undefined): string;
    /** Whether a chat app is connected and switched on for this assistant. */
    chatConnected(person: Person): boolean;
    /** Send to the user's chat app now, or at the end of quiet hours unless this turn may reach them inside them. */
    sendToChat(person: Person, sessionId: string, text: string): ChatOutcome;
    /** Whether the session's running turn holds a message from the user, on any channel. */
    turnFromUser(sessionId: string): boolean;
    /** The wake-ups an assistant has waiting, soonest first. */
    wakes(person: Person): readonly WakeRequest[];
    addWake(person: Person, wake: Omit<WakeRequest, 'id'>): WakeRequest | undefined;
    cancelWakes(person: Person, match: string): WakeRequest[];
    /** Change an assistant's own settings; a field set to undefined goes back to its default. */
    updateSettings(personId: string, patch: {
        readonly [K in keyof AssistantSettings]?: AssistantSettings[K] | undefined;
    }): Promise<void>;
}
/**
 * Run a call outside the host's settings transaction.
 *
 * Settings updates run in the HMR service's exclusive transactions, which
 * refuse to nest; the "inside a transaction" flag is an AsyncLocalStorage, so
 * every async continuation started by a settings change (this plugin's
 * reaction to a new user, a WeChat login that a request started)
 * still carries it. Leaving that storage lets the write queue behind the open
 * transaction instead of failing.
 * @param hmr - the `hmr` service, if present.
 * @returns a runner; a plain call when the service or its storage is absent.
 */
export declare function outsideTransactions(hmr: unknown): <T>(run: () => T) => T;
/**
 * Writes to this plugin's settings row one at a time, each patch computed
 * from the stored values at its turn, so the host never overwrites a change
 * the page made in between.
 */
export declare class SettingsWriter {
    private readonly settings;
    private readonly namespace;
    private readonly warn;
    private readonly outside;
    private queue;
    /**
     * @param settings - the settings service, read at write time.
     * @param namespace - this plugin's settings namespace.
     * @param warn - reports a write that failed for good.
     * @param outside - runs a call outside any open settings transaction (see `outsideTransactions`).
     */
    constructor(settings: () => SettingsLike | undefined, namespace: string, warn: (message: string) => void, outside?: <T>(run: () => T) => T);
    /** The settings namespace of the row: its id, as `describe()` lists it. */
    private ns;
    /**
     * Queue one write. Each field replaces what is stored: `settings.update`
     * merges plain objects recursively, so a key dropped from one would stay.
     * @param patch - computes the fields to set from the stored values at write time, or undefined to skip.
     * @returns a promise that settles when this write is done.
     */
    write(patch: () => Record<string, unknown> | undefined): Promise<void>;
}
