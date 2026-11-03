/**
 * The assistant conversation's title is its assistant's name. The host titles a
 * session from its first message (and may let a model refine that); this
 * module replaces any such title, and a rename from the session list, with
 * the assistant's name as a user-sourced title, which also stops the host's
 * automatic titling for that session.
 * @module dsh-assisstant/host/title
 */
import type { SessionLike, SessionTitleLike } from './types.ts';
/** What the title pin needs from the plugin. */
export interface TitlePinDeps {
    titles(): SessionTitleLike | undefined;
    /** The assistant's name for an assistant conversation, else undefined. */
    nameOf(sessionId: string): string | undefined;
    warn(message: string): void;
}
export declare class TitlePin {
    private readonly deps;
    /** Session id → the name last applied, so a live session is read at most once per name. */
    private readonly applied;
    constructor(deps: TitlePinDeps);
    /**
     * Give a live assistant conversation its assistant's name, unless it has it.
     * @param session - a live root session on the family preset.
     */
    apply(session: SessionLike): void;
    /**
     * React to a `session/title` event of an assistant conversation: any title but
     * the one applied is replaced on the next microtask.
     * @param session - the session the event belongs to.
     * @param data - the event's payload.
     */
    observe(session: SessionLike, data: {
        readonly title?: string;
        readonly source?: {
            readonly kind?: string;
        };
    } | undefined): void;
}
