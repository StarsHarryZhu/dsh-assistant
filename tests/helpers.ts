/**
 * Fake host services shared by the specs: a cordis-like context that records
 * effects and listeners, a tool registry with restrictions, sessions, agents,
 * and a `dshAssisstant` service over plain settings.
 */

import { DEFAULTS } from '../src/shared/settings.ts'
import type { Person } from '../src/shared/settings.ts'
import type { BalanceState } from '../src/host/balance.ts'
import type { AssistantService, SharedSettings, InputChannel } from '../src/host/service.ts'

/** A recorded listener. */
type Listener = (...args: never[]) => unknown

/** A fake cordis context. */
export class FakeContext {
  readonly listeners = new Map<string, Listener[]>()
  readonly disposers: (() => void)[] = []
  readonly provided = new Map<string, unknown>()
  readonly warnings: string[] = []
  readonly logger = { warn: (message: string) => { this.warnings.push(message) } }

  constructor(readonly services: Record<string, unknown> = {}) {
    for (const [name, value] of Object.entries(services)) (this as Record<string, unknown>)[name] = value
  }

  get(name: string): unknown {
    return this.services[name] ?? this.provided.get(name)
  }

  on(name: string, listener: Listener): () => void {
    const list = this.listeners.get(name) ?? []
    list.push(listener)
    this.listeners.set(name, list)
    return () => { list.splice(list.indexOf(listener), 1) }
  }

  effect(execute: () => (() => void) | void): void {
    const dispose = execute()
    if (typeof dispose === 'function') this.disposers.push(dispose)
  }

  provide(name: string, value: unknown): void {
    this.provided.set(name, value)
  }

  inject(deps: string[], callback: (scope: FakeContext) => void): void {
    if (deps.every(dep => this.get(dep) !== undefined)) callback(this)
  }

  /** Call every listener of an event and return their results. */
  emit(name: string, ...args: unknown[]): unknown[] {
    return (this.listeners.get(name) ?? []).map(listener => (listener as (...a: unknown[]) => unknown)(...args))
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0).reverse()) dispose()
  }
}

/** A fake tool registry: global tools, preset tools, and deny restrictions. */
export class FakeTools {
  readonly globals = new Set<string>()
  readonly scoped: { name: string }[] = []
  readonly restrictions: { deny?: readonly string[]; allow?: readonly string[] }[] = []
  onChange: () => void = () => undefined

  register(definition: { name: string }): () => void {
    this.scoped.push(definition)
    return () => { this.scoped.splice(this.scoped.indexOf(definition), 1) }
  }

  restrict(filter: { deny?: readonly string[]; allow?: readonly string[] }): () => void {
    for (const name of [...filter.deny ?? [], ...filter.allow ?? []]) {
      if (!this.globals.has(name)) throw new Error(`unknown global tool ${name}`)
    }
    this.restrictions.push(filter)
    this.onChange()
    return () => {
      const index = this.restrictions.indexOf(filter)
      if (index >= 0) this.restrictions.splice(index, 1)
      this.onChange()
    }
  }

  schemas(): { name: string }[] {
    return [...this.globals].map(name => ({ name }))
  }

  /** Global tools an agent of the restricted scope sees. */
  visibleGlobals(): string[] {
    return [...this.globals].filter(name => this.restrictions.every(filter => !(filter.deny ?? []).includes(name))).sort()
  }
}

/** A fake session. */
export function fakeSession(id: string, header: Record<string, unknown> = {}) {
  const appended: { type: string; data: unknown }[] = []
  return {
    id,
    header: { id, ...header },
    appended,
    append(type: string, data: unknown) { appended.push({ type, data }) },
  }
}

/** A fake agent over a fake session. */
export function fakeAgent(session: ReturnType<typeof fakeSession>, route: Record<string, string> = { provider: 'other', model: 'other-model', reasoningEffort: 'high' }) {
  let current: Record<string, string> = { ...route }
  const selections: Record<string, string>[] = []
  return {
    id: session.id,
    session,
    selections,
    model: {
      current: () => current,
      select: (next: Record<string, string>) => { selections.push(next); current = { ...next } },
    },
  }
}

/** A `dshAssisstant` service over editable settings. */
export function fakeService(overrides: Partial<SharedSettings> = {}, people: Person[] = []) {
  const settings: SharedSettings = { ...DEFAULTS, ...overrides }
  let balance: BalanceState = { status: 'unknown', checkedAt: 0 }
  const inputs = new Map<string, InputChannel>()
  const service: AssistantService & { setBalance(state: BalanceState): void } = {
    settings: () => settings,
    people: () => people,
    personForSession: sessionId => people.find(person => person.sessionId === sessionId),
    balance: () => balance,
    refreshBalance: async () => balance,
    lastInput: sessionId => inputs.get(sessionId) ?? 'web',
    markInput: (sessionId, channel) => { inputs.set(sessionId, channel) },
    zoneFor: () => 'America/New_York',
    chatConnected: () => false,
    routeChat: () => ({ status: 'unavailable' }),
    turnFromUser: () => false,
    wakes: () => [],
    addWake: () => undefined,
    cancelWakes: () => [],
    updateSettings: async () => undefined,
    setBalance: (state) => { balance = state },
  }
  return service
}
