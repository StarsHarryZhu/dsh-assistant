/**
 * The watchdog: an outside control loop over the assistant conversations and
 * their workers (the Super-agent design's Watchdog, reduced to what a family
 * install needs). It watches activity, not processes:
 *
 * - an assistant conversation whose turn has produced no session event for the
 *   stall limit is stopped, and the conversation gets a system note so it
 *   tells the family member in plain words;
 * - a worker that has gone quiet for the stall limit while running is reported
 *   to its assistant conversation once, which decides whether to wait, ask it, or
 *   interrupt it.
 * @module dsh-assisstant/host/watchdog
 */
/** Starts every system note, so the router tells it from the family member's words. */
export const SYSTEM_PREFIX = '[assistant-system]';
/** Watches assistant sessions; the plugin feeds it events and ticks it on a timer. */
export class Watchdog {
    deps;
    sessions = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * Record one session event.
     * @param sessionId - the session.
     * @param role - its layer.
     * @param router - the assistant conversation it belongs to (itself for a router).
     * @param type - the event type.
     */
    observe(sessionId, role, router, type) {
        const now = this.deps.now();
        const tracked = this.sessions.get(sessionId) ?? { role, router, running: false, lastEventAt: now };
        tracked.lastEventAt = now;
        if (type === 'turn/start')
            tracked.running = true;
        if (type === 'turn/end')
            tracked.running = false;
        this.sessions.set(sessionId, tracked);
    }
    /**
     * The assistant conversation a session reports to.
     * @param sessionId - a router, a worker, or an unknown session.
     * @returns the router of a known session, else the id itself.
     */
    routerOf(sessionId) {
        return this.sessions.get(sessionId)?.router ?? sessionId;
    }
    /** Forget a session (removed person, ended worker). */
    forget(sessionId) {
        this.sessions.delete(sessionId);
    }
    /**
     * Act on every stall.
     * @returns the session ids acted on, for tests and logs.
     */
    tick() {
        const now = this.deps.now();
        const acted = [];
        for (const [sessionId, tracked] of this.sessions) {
            const limit = this.deps.stallMs(tracked.router);
            if (!tracked.running || now - tracked.lastEventAt < limit || tracked.handled === tracked.lastEventAt)
                continue;
            tracked.handled = tracked.lastEventAt;
            const minutes = Math.round(limit / 60_000);
            if (tracked.role === 'router') {
                tracked.running = false;
                this.deps.cancel(sessionId);
                this.deps.notify(sessionId, `${SYSTEM_PREFIX} Watchdog: the last turn made no progress for over ${minutes} minutes and was stopped automatically. Tell the family member in one plain sentence that it did not get finished, and ask whether they want to try again in other words.`);
            }
            else {
                this.deps.notify(tracked.router, `${SYSTEM_PREFIX} Watchdog: background worker ${sessionId} has made no progress for ${minutes} minutes. If needed, ask it with send_message, or stop it with interrupt_agent and start the work again. Do not tell the family member unless the work cannot get done because of this.`);
            }
            acted.push(sessionId);
        }
        return acted;
    }
}
