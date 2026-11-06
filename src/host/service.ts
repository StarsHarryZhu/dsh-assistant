/**
 * The `dshAssisstant` service the settings row provides to the preset's
 * plugins (policy and compactor), plus the serialized settings writer the row
 * uses to store what the host finds out.
 * @module dsh-assisstant/host/service
 */

import { randomUUID } from 'node:crypto'
import { PLUGIN_ID } from '../shared/settings.ts'
import type { AssistantSettings, Person, WorkerModel } from '../shared/settings.ts'
import type { BalanceState } from './balance.ts'
import type { WakeRequest } from './heartbeat.ts'
import type { HostNoteLike, SessionControllerLike, SessionLike, SettingsLike } from './types.ts'

/** The settings every assistant shares, as plain values. Each assistant's own are on its assistant list entry. */
export interface SharedSettings {
  readonly compactRatio: number
  /** The models a worker may run; the assistant conversation picks one per task. */
  readonly workerModels: readonly WorkerModel[]
  readonly balanceThreshold: number
  readonly balanceCheckMinutes: number
  readonly balanceReminder: string
  readonly personaSelfCorrect: boolean
  readonly personaCooldownHours: number
  readonly personaMaxChars: number
  readonly profileMaxChars: number
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
export function guarded<A extends unknown[]>(warn: (message: string) => void, label: string, listener: (...args: A) => unknown): (...args: A) => void {
  let reported = false
  const report = (error: unknown): void => {
    if (reported) return
    reported = true
    warn(`the ${label} listener failed and is skipped for this event: ${String(error)}`)
  }
  return (...args) => {
    try {
      const result = listener(...args)
      if (result instanceof Promise) result.catch(report)
    } catch (error) {
      report(error)
    }
  }
}

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
export async function sendHostNote(controller: Pick<SessionControllerLike, 'resolveAgent'>, sessionId: string, text: string): Promise<void> {
  const result = await controller.resolveAgent(sessionId)
  if ('error' in result) throw result.error
  const note: HostNoteLike = { id: randomUUID(), role: 'user', content: [{ type: 'text', text }], source: { kind: 'host-note', plugin: PLUGIN_ID } }
  result.agent.followup(note)
}

/** Where a session's latest user input came from. */
export type InputChannel = 'web' | 'wechat'

/** What became of a message for the user's chat app. */
export type ChatOutcome =
  | { readonly status: 'sent' }
  /** Quiet hours are on, so the host sends it when they end. */
  | { readonly status: 'held'; readonly until: number }
  /** No chat app is connected and switched on. */
  | { readonly status: 'unavailable' }

/** The service. */
export interface AssistantService {
  settings(): SharedSettings
  people(): readonly Person[]
  personForSession(sessionId: string): Person | undefined
  balance(): BalanceState
  refreshBalance(): Promise<BalanceState>
  lastInput(sessionId: string): InputChannel
  markInput(sessionId: string, channel: InputChannel): void
  /** The user's IANA zone: what the profile records, else this computer's as a stand-in. */
  zoneFor(session: SessionLike | undefined): string
  /** Whether a chat app is connected and switched on for this assistant. */
  chatConnected(person: Person): boolean
  /** Send to the user's chat app now, or at the end of quiet hours unless this turn may reach them inside them. */
  sendToChat(person: Person, sessionId: string, text: string): ChatOutcome
  /** Whether the session's running turn holds a message from the user, on any channel. */
  turnFromUser(sessionId: string): boolean
  /** The wake-ups an assistant has waiting, soonest first. */
  wakes(person: Person): readonly WakeRequest[]
  addWake(person: Person, wake: Omit<WakeRequest, 'id'>): WakeRequest | undefined
  cancelWakes(person: Person, match: string): WakeRequest[]
  /** Change an assistant's own settings; a field set to undefined goes back to its default. */
  updateSettings(personId: string, patch: { readonly [K in keyof AssistantSettings]?: AssistantSettings[K] | undefined }): Promise<void>
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
export function outsideTransactions(hmr: unknown): <T>(run: () => T) => T {
  const storage = (hmr as { executing?: { exit?: unknown } } | undefined)?.executing
  const exit = storage?.exit
  if (typeof exit !== 'function') return run => run()
  return run => (exit as (callback: () => unknown) => unknown).call(storage, run) as ReturnType<typeof run>
}

/** Retries of a write refused because a settings transaction is still open. */
const MAX_NESTED_RETRIES = 50

/** Delay between those retries, in milliseconds. */
const NESTED_RETRY_MS = 100

/**
 * Writes to this plugin's settings row one at a time, each patch computed
 * from the stored values at its turn, so the host never overwrites a change
 * the page made in between.
 */
export class SettingsWriter {
  private queue: Promise<void> = Promise.resolve()

  /**
   * @param settings - the settings service, read at write time.
   * @param namespace - this plugin's settings namespace.
   * @param warn - reports a write that failed for good.
   * @param outside - runs a call outside any open settings transaction (see `outsideTransactions`).
   */
  constructor(
    private readonly settings: () => SettingsLike | undefined,
    private readonly namespace: string,
    private readonly warn: (message: string) => void,
    private readonly outside: <T>(run: () => T) => T = run => run(),
  ) {}

  /** The settings namespace of the row: its id, as `describe()` lists it. */
  private ns(settings: SettingsLike): string {
    const forms = settings.describe()
    return forms.find(form => form.ns === this.namespace)?.ns
      ?? forms.find(form => form.ns.endsWith(this.namespace))?.ns
      ?? this.namespace
  }

  /**
   * Queue one write. Each field replaces what is stored: `settings.update`
   * merges plain objects recursively, so a key dropped from one would stay.
   * @param patch - computes the fields to set from the stored values at write time, or undefined to skip.
   * @returns a promise that settles when this write is done.
   */
  write(patch: () => Record<string, unknown> | undefined): Promise<void> {
    const run = async (): Promise<void> => {
      // A write that a settings change set off runs while that change's
      // transaction is still open, and the host refuses nested transactions:
      // wait for it to close, recomputing the patch from the latest values.
      for (let attempt = 0; ; attempt += 1) {
        const settings = this.settings()
        if (settings === undefined) return
        const fields = patch()
        if (fields === undefined) return
        try {
          const ns = this.ns(settings)
          const ops = Object.entries(fields).map(([key, value]) => ({ op: 'set' as const, path: [key], value }))
          await this.outside(() => settings.mutate(ns, ops))
          return
        } catch (error) {
          if (/cannot be nested/u.test(String(error)) && attempt < MAX_NESTED_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, NESTED_RETRY_MS))
            continue
          }
          this.warn(`could not store ${Object.keys(fields).join(', ')}: ${String(error)}`)
          return
        }
      }
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => undefined)
    return next
  }
}
