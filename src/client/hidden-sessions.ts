/**
 * Keeps assistant conversations out of the host's session lists. They are opened
 * from the assistant's own sidebar row, so they do not belong under Ungrouped or
 * a workspace.
 *
 * The host's sidebar builds its groups and its flat list from a list's `ids` and
 * a workspace's `sessionIds`, and everything that opens or shows one session
 * reads `byId`. So this page's copy of those two stores answers with the ids left
 * out and `byId` whole: the rows disappear while the conversation keeps working.
 * Marking a row `origin: 'subagent'` would hide it too, but the conversation's
 * own view reads that field, and would lose its workers panel.
 * @module dsh-assisstant/client/hidden-sessions
 */

/** One row of the host's session list, as far as it is read here. */
interface SessionRowLike {
  readonly projectionValues?: { readonly agentPreset?: unknown } | undefined
}

/** `ctx.sessions.list`'s snapshot. */
export interface SessionListLike {
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionRowLike | undefined>>
}

/** `ctx.workspaces.list`'s snapshot. */
export interface WorkspaceListLike {
  readonly items: readonly { readonly sessionIds: readonly string[] }[]
}

/** A store of the host's page. `set` exists on the session list only. */
export interface SnapshotStoreLike<T> {
  getSnapshot(): T
  set?(next: T): void
}

/**
 * Answer a store's `getSnapshot` through a filter, keeping each result until the
 * store or the filter's input changes, as `useSyncExternalStore` requires.
 * @param store - the store.
 * @param version - changes whenever the filter would answer differently.
 * @param filter - the snapshot to answer with; returning its input changes nothing.
 * @returns how to read the store unfiltered, and the cleanup.
 */
function filterSnapshots<T>(store: SnapshotStoreLike<T>, version: () => string, filter: (snapshot: T) => T): { raw(): T; restore(): void } {
  const own = Object.getOwnPropertyDescriptor(store, 'getSnapshot')
  const original = store.getSnapshot
  const raw = (): T => original.call(store)
  let seen: { snapshot: T; version: string; answer: T } | undefined
  store.getSnapshot = () => {
    const snapshot = raw()
    const current = version()
    if (seen === undefined || seen.snapshot !== snapshot || seen.version !== current) seen = { snapshot, version: current, answer: filter(snapshot) }
    return seen.answer
  }
  return {
    raw,
    restore: () => {
      if (own === undefined) delete (store as { getSnapshot?: unknown }).getSnapshot
      else Object.defineProperty(store, 'getSnapshot', own)
    },
  }
}

/** What to hide. */
export interface HiddenSessionsDeps {
  /** The assistant conversations in the assistant list. */
  ids(): ReadonlySet<string>
  /** Presets whose every conversation is hidden: one no longer listed, or not yet. */
  readonly presets: readonly string[]
}

/** The hidden sessions over the host's session list. */
export interface HiddenSessions {
  /** Whether a session is hidden. */
  hidden(id: string): boolean
  /** Make the list answer again, after what is hidden changed. */
  refresh(): void
  /** A string that changes whenever the hidden ids may have. */
  version(): string
  restore(): void
}

/**
 * Leave assistant conversations out of the session list's `ids`.
 * @param list - `ctx.sessions.list`.
 * @param deps - what to hide.
 * @returns the hidden sessions, and how to undo this.
 */
export function hideSessionRows(list: SnapshotStoreLike<SessionListLike>, deps: HiddenSessionsDeps): HiddenSessions {
  const version = (): string => [...deps.ids()].sort().join(',')
  const hiddenIn = (snapshot: SessionListLike, id: string): boolean => {
    if (deps.ids().has(id)) return true
    const preset = snapshot.byId[id]?.projectionValues?.agentPreset
    return typeof preset === 'string' && deps.presets.includes(preset)
  }
  const filtered = filterSnapshots(list, version, (snapshot) => {
    const ids = snapshot.ids.filter(id => !hiddenIn(snapshot, id))
    return ids.length === snapshot.ids.length ? snapshot : { ...snapshot, ids }
  })
  return {
    hidden: id => hiddenIn(filtered.raw(), id),
    // A new object makes the store tell its subscribers; what it holds stays the host's own.
    refresh: () => { list.set?.({ ...filtered.raw() }) },
    version,
    restore: filtered.restore,
  }
}

/**
 * Leave assistant conversations out of each workspace's `sessionIds`, for one
 * whose folder is also a registered workspace.
 * @param list - `ctx.workspaces.list`.
 * @param sessions - the hidden sessions.
 * @returns the cleanup.
 */
export function hideWorkspaceMembers(list: SnapshotStoreLike<WorkspaceListLike>, sessions: Pick<HiddenSessions, 'hidden' | 'version'>): () => void {
  const filtered = filterSnapshots(list, sessions.version, (snapshot) => {
    if (!snapshot.items.some(item => item.sessionIds.some(sessions.hidden))) return snapshot
    return { ...snapshot, items: snapshot.items.map(item => ({ ...item, sessionIds: item.sessionIds.filter(id => !sessions.hidden(id)) })) }
  })
  return filtered.restore
}
