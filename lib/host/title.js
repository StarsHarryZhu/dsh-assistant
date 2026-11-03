/**
 * The assistant conversation's title is its assistant's name. The host titles a
 * session from its first message (and may let a model refine that); this
 * module replaces any such title, and a rename from the session list, with
 * the assistant's name as a user-sourced title, which also stops the host's
 * automatic titling for that session.
 * @module dsh-assisstant/host/title
 */
export class TitlePin {
    deps;
    /** Session id → the name last applied, so a live session is read at most once per name. */
    applied = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * Give a live assistant conversation its assistant's name, unless it has it.
     * @param session - a live root session on the family preset.
     */
    apply(session) {
        const name = this.deps.nameOf(session.id);
        const titles = this.deps.titles();
        if (name === undefined || titles === undefined || this.applied.get(session.id)?.name === name)
            return;
        try {
            const current = titles.get(session);
            const title = current?.title === name && current.source.kind === 'user' ? current.title : titles.rename(session, name).title;
            this.applied.set(session.id, { name, title });
        }
        catch (error) {
            this.deps.warn(`could not title the conversation ${session.id}: ${String(error)}`);
        }
    }
    /**
     * React to a `session/title` event of an assistant conversation: any title but
     * the one applied is replaced on the next microtask.
     * @param session - the session the event belongs to.
     * @param data - the event's payload.
     */
    observe(session, data) {
        if (data?.source?.kind === 'user' && data.title === this.applied.get(session.id)?.title)
            return;
        this.applied.delete(session.id);
        queueMicrotask(() => { this.apply(session); });
    }
}
