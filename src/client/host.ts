/**
 * The slice of host slot props and client services the browser half reads,
 * as structural types. The browser half imports no harness package, not even
 * for types; fields are optional where an older host or another composition
 * may leave them out, and the page degrades instead of throwing.
 * @module dsh-assisstant/client/host
 */

/** Bound translator for this plugin's namespace. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/** An observable snapshot (`ObservableSnapshot` of `@deepseek-ai/dsh-client-store`). */
export interface Observable<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** A settings path edit (`SettingsPathOpView`). */
export type PathOp = { op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }

/** One snapshot of a settings form (`ConfigFormSnapshot`). */
export interface FormSnapshotLike {
  readonly status?: 'loading' | 'ready' | 'unavailable'
  readonly value?: Record<string, unknown>
  readonly revision?: number
  readonly writable?: boolean
}

/** One settings form (`ConfigForm`). */
export interface ConfigFormLike extends Observable<FormSnapshotLike> {
  mutate(ops: readonly PathOp[], expectedRevision?: number): Promise<boolean>
}

/** The settings forms service. */
export interface ConfigFormsLike {
  get(entryId: string): ConfigFormLike
}

/** A remote call result (`RemoteResult`). */
export interface RemoteResultLike<T> {
  readonly ok: boolean
  readonly value?: T
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** One model of the catalog (`ModelCatalogModel`). */
export interface CatalogModel {
  readonly id: string
  readonly name?: string
  readonly reasoning?: {
    readonly efforts: readonly { readonly id: string; readonly name: string }[]
    readonly defaultEffort?: string
  }
}

/** One provider group of the catalog. */
export interface CatalogGroup {
  readonly id: string
  readonly name?: string
  readonly models: readonly CatalogModel[]
}

/** One conversation's model, effort included. */
export interface ModelSelectionLike {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** One conversation's model choice, shared with its composer (`ModelDirectory` of `@deepseek-ai/dsh-client-ui-model-selection`). */
export interface ModelDirectoryLike {
  readonly store: Observable<{ readonly current: ModelSelectionLike | null; readonly groups: readonly CatalogGroup[] }>
  load(): Promise<unknown>
  select(selection: ModelSelectionLike): Promise<{ readonly ok: boolean }>
}

/** `ctx.modelDirectories`. */
export interface ModelDirectoriesLike {
  directoryFor(sessionId: string): ModelDirectoryLike
}

/** `ctx.remote.session`, reduced to the model catalog. */
export interface RemoteSessionLike {
  modelCatalog(): Promise<RemoteResultLike<{ groups: readonly CatalogGroup[] }>>
}

/** `ctx.sessions` (`ISessions`), reduced to who retains a session. */
export interface SessionsLike {
  retainInfo(id: string): Observable<{ readonly retainedBy: Readonly<Record<string, number | undefined>> }>
}

/** `ctx.layout` (`LayoutService`). */
export interface LayoutLike {
  readonly panelInfo: Observable<{ readonly activePanelId: string | null }>
  selectPanel(panelId: string | null): void
}

/** `ctx.uiWorkspace` (`UiWorkspace`). */
export interface UiWorkspaceLike {
  /** The host's folder chooser; null when the family member cancels it. */
  pickDirectory(): Promise<string | null>
  archiveSession(sessionId: string): Promise<void>
  /** Show the session in the host's conversation view and return the main area to it. */
  openSession(sessionId: string): void
}

/** The client context services the browser half uses. */
export interface ClientContextLike {
  get?(name: string): unknown
  effect?(execute: () => (() => void) | void, label?: string): unknown
  inject?(deps: string[], callback: (scope: ClientContextLike) => void): unknown
}

/** The slot registry service. */
export interface SlotsLike {
  inject(name: string, callback: () => (() => void) | void): unknown
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** The locale service. */
export interface LocaleLike {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
}
