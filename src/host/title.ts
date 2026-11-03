/**
 * The assistant conversation's title is its assistant's name. The host titles a
 * session from its first message (and may let a model refine that); this
 * module replaces any such title, and a rename from the session list, with
 * the assistant's name as a user-sourced title, which also stops the host's
 * automatic titling for that session.
 * @module dsh-assisstant/host/title
 */

import type { SessionLike, SessionTitleLike } from './types.ts'

/** What the title pin needs from the plugin. */
export interface TitlePinDeps {
  titles(): SessionTitleLike | undefined
  /** The assistant's name for an assistant conversation, else undefined. */
  nameOf(sessionId: string): string | undefined
  warn(message: string): void
}

export class TitlePin {
  /** Session id → the name last applied, so a live session is read at most once per name. */
  private readonly applied = new Map<string, { readonly name: string; readonly title: string }>()

  constructor(private readonly deps: TitlePinDeps) {}

  /**
   * Give a live assistant conversation its assistant's name, unless it has it.
   * @param session - a live root session on the family preset.
   */
  apply(session: SessionLike): void {
    const name = this.deps.nameOf(session.id)
    const titles = this.deps.titles()
    if (name === undefined || titles === undefined || this.applied.get(session.id)?.name === name) return
    try {
      const current = titles.get(session)
      const title = current?.title === name && current.source.kind === 'user' ? current.title : titles.rename(session, name).title
      this.applied.set(session.id, { name, title })
    } catch (error) {
      this.deps.warn(`could not title the conversation ${session.id}: ${String(error)}`)
    }
  }

  /**
   * React to a `session/title` event of an assistant conversation: any title but
   * the one applied is replaced on the next microtask.
   * @param session - the session the event belongs to.
   * @param data - the event's payload.
   */
  observe(session: SessionLike, data: { readonly title?: string; readonly source?: { readonly kind?: string } } | undefined): void {
    if (data?.source?.kind === 'user' && data.title === this.applied.get(session.id)?.title) return
    this.applied.delete(session.id)
    queueMicrotask(() => { this.apply(session) })
  }
}
