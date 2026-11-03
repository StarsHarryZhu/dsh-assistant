/**
 * The watchdog: an outside control loop over the assistant conversations and
 * their workers (the Super-agent design's Watchdog, reduced to what a user
 * install needs). It watches activity, not processes:
 *
 * - an assistant conversation whose turn has produced no session event for the
 *   stall limit is stopped, and the conversation gets a system note so it
 *   tells the user in plain words;
 * - a worker that has gone quiet for the stall limit while running is reported
 *   to its assistant conversation once, which decides whether to wait, ask it, or
 *   interrupt it.
 * @module dsh-assisstant/host/watchdog
 */
/** Which side of the two layers a session is on. */
export type SessionRole = 'router' | 'worker';
/** What the watchdog needs from the plugin. */
export interface WatchdogDeps {
    now(): number;
    /** The stall limit in milliseconds of the assistant an assistant conversation belongs to. */
    stallMs(routerSessionId: string): number;
    /** Stop an assistant conversation's running turn. */
    cancel(sessionId: string): void;
    /** Send a system note into an assistant conversation. */
    notify(routerSessionId: string, text: string): void;
}
/** Starts every system note, so the router tells it from the user's words. */
export declare const SYSTEM_PREFIX = "[assistant-system]";
/** Watches assistant sessions; the plugin feeds it events and ticks it on a timer. */
export declare class Watchdog {
    private readonly deps;
    private readonly sessions;
    constructor(deps: WatchdogDeps);
    /**
     * Record one session event.
     * @param sessionId - the session.
     * @param role - its layer.
     * @param router - the assistant conversation it belongs to (itself for a router).
     * @param type - the event type.
     */
    observe(sessionId: string, role: SessionRole, router: string, type: string): void;
    /**
     * The assistant conversation a session reports to.
     * @param sessionId - a router, a worker, or an unknown session.
     * @returns the router of a known session, else the id itself.
     */
    routerOf(sessionId: string): string;
    /** Forget a session (removed person, ended worker). */
    forget(sessionId: string): void;
    /**
     * Act on every stall.
     * @returns the session ids acted on, for tests and logs.
     */
    tick(): string[];
}
