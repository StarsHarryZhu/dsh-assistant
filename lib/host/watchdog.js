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
export const SYSTEM_PREFIX = '[助理·系统]';
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
                this.deps.notify(sessionId, `${SYSTEM_PREFIX} 看门狗：上一轮超过 ${minutes} 分钟没有任何进展，已经自动停止。请用一句白话告诉家人刚才的事没做完，并问他们要不要换个说法再试。`);
            }
            else {
                this.deps.notify(tracked.router, `${SYSTEM_PREFIX} 看门狗：后台子代理 ${sessionId} 已经 ${minutes} 分钟没有进展。需要时用 send_message 问它，或用 interrupt_agent 停掉它再重新派活。不用告诉家人，除非这件事因此做不成。`);
            }
            acted.push(sessionId);
        }
        return acted;
    }
}
