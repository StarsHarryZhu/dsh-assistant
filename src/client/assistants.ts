/**
 * The assistant list and WeChat requests as the page reads and writes them,
 * through the settings form of the `dsh-assisstant` row. The host fills
 * in each new person's folder and conversation and writes WeChat states back
 * through the same form, so the page re-renders as those arrive.
 * @module dsh-assisstant/client/assistants
 */

import { useSyncExternalStore } from 'react'
import { ASSISTANT_DEFAULTS, PLUGIN_ID, readPeople, readWechatStates } from '../shared/settings.ts'
import type { AssistantSettings, Person, SandboxMode, WechatOptions, WechatRequest, WechatState } from '../shared/settings.ts'
import type { ConfigFormLike, FormSnapshotLike } from './host.ts'

/** What the page needs from the form. */
export interface AssistantsView {
  readonly ready: boolean
  readonly writable: boolean
  readonly revision: number | undefined
  readonly people: readonly Person[]
  readonly wechat: Readonly<Record<string, WechatState>>
  readonly value: Record<string, unknown>
}

/** @returns the page's view of one form snapshot. */
export function assistantsView(snapshot: FormSnapshotLike): AssistantsView {
  const value = snapshot.value ?? {}
  return {
    ready: snapshot.status === 'ready',
    writable: snapshot.writable !== false,
    revision: snapshot.revision,
    people: readPeople(value.people),
    wechat: readWechatStates(value.wechatState),
    value,
  }
}

/**
 * Subscribe a component to the form.
 * @param form - the settings form.
 * @returns the current snapshot.
 */
export function useForm(form: ConfigFormLike): FormSnapshotLike {
  return useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot())
}

/** @returns a short random id. */
export function newId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return random.replaceAll('-', '').slice(0, 12)
}

/** @returns the stored people as plain objects, for a `set`. */
function plain(people: readonly Person[]): Record<string, unknown>[] {
  return people.map(person => ({ ...person }))
}

/** What the page asks when an assistant is created or renamed. */
export interface Naming {
  /** The assistant's name. */
  readonly name: string
  /** What it should call its user; empty to leave it to the assistant. */
  readonly address: string
}

/** @returns the trimmed name and address, the address left out when empty. */
function named(naming: Naming): Pick<Person, 'name' | 'address'> {
  const address = naming.address.trim()
  return { name: naming.name.trim(), ...(address === '' ? {} : { address }) }
}

/**
 * Create an assistant; the host creates its conversation.
 * @param form - the settings form.
 * @param view - the current view.
 * @param naming - its name and what it calls its user.
 * @param cwd - the workspace folder the user chose.
 * @param zoneHint - where they say they are, in their own words; the assistant works out the time zone.
 * @returns the new assistant's id, or undefined when the write was refused.
 */
export async function addPerson(form: ConfigFormLike, view: AssistantsView, naming: Naming, cwd: string, zoneHint = ''): Promise<string | undefined> {
  const id = newId()
  const hint = zoneHint.trim()
  const person: Person = { id, ...named(naming), cwd, ...(hint === '' ? {} : { zoneHint: hint }) }
  const ok = await form.mutate([{ op: 'set', path: ['people'], value: plain([...view.people, person]) }], view.revision)
  return ok ? id : undefined
}

/** Save an assistant's name, what it calls its user, and its own settings; only what differs from the defaults is stored. */
export function updateAssistant(form: ConfigFormLike, view: AssistantsView, id: string, naming: Naming, values: AssistantSettings): Promise<boolean> {
  const changed = Object.entries(values).filter(([key, value]) => (ASSISTANT_DEFAULTS as Record<string, unknown>)[key] !== value && value !== undefined)
  const people = view.people.map((person) => {
    if (person.id !== id) return person
    const { name: _name, address: _address, settings: stored, ...rest } = person
    // Temporary quiet hours have no field on the form: the assistant sets them.
    const { tempQuietFrom, tempQuietUntil } = stored ?? {}
    const settings = {
      ...Object.fromEntries(changed),
      ...(tempQuietFrom === undefined ? {} : { tempQuietFrom }),
      ...(tempQuietUntil === undefined ? {} : { tempQuietUntil }),
    }
    return { ...rest, ...named(naming), ...(Object.keys(settings).length === 0 ? {} : { settings }) }
  })
  return form.mutate([{ op: 'set', path: ['people'], value: plain(people) }], view.revision)
}

/** Change what an assistant's workers may touch; the default is not stored. */
export function setSandboxMode(form: ConfigFormLike, view: AssistantsView, id: string, mode: SandboxMode): Promise<boolean> {
  const people = view.people.map((person) => {
    if (person.id !== id) return person
    const { settings: stored, ...rest } = person
    const { sandboxMode: _old, ...others } = stored ?? {}
    const settings = mode === ASSISTANT_DEFAULTS.sandboxMode ? others : { ...others, sandboxMode: mode }
    return { ...rest, ...(Object.keys(settings).length === 0 ? {} : { settings }) }
  })
  return form.mutate([{ op: 'set', path: ['people'], value: plain(people) }], view.revision)
}

/** End an assistant's temporary quiet hours. */
export function clearTemporaryQuiet(form: ConfigFormLike, view: AssistantsView, id: string): Promise<boolean> {
  const people = view.people.map((person) => {
    if (person.id !== id) return person
    const { settings: stored, ...rest } = person
    const { tempQuietFrom: _from, tempQuietUntil: _until, ...others } = stored ?? {}
    return { ...rest, ...(Object.keys(others).length === 0 ? {} : { settings: others }) }
  })
  return form.mutate([{ op: 'set', path: ['people'], value: plain(people) }], view.revision)
}

/** Remove an assistant from the list; the host unbinds its WeChat. */
export function removePerson(form: ConfigFormLike, view: AssistantsView, id: string): Promise<boolean> {
  return form.mutate([{ op: 'set', path: ['people'], value: plain(view.people.filter(person => person.id !== id)) }], view.revision)
}

/** Ask the host to act on one assistant's WeChat: bind, unbind, stop binding, reconnect, diagnose, or change options. */
export function requestWechat(form: ConfigFormLike, personId: string, action: WechatRequest['action'], options?: WechatOptions): Promise<boolean> {
  const request: WechatRequest = { personId, action, nonce: newId(), ...(options === undefined ? {} : { options: { ...options } }) }
  return form.mutate([{ op: 'set', path: ['wechatRequest'], value: { ...request } }])
}

const LAST_ASSISTANT_KEY = `${PLUGIN_ID}:last-session`

/** Remember which conversation this browser last showed; losing it only opens another assistant. */
export function rememberAssistant(sessionId: string): void {
  try {
    localStorage.setItem(LAST_ASSISTANT_KEY, sessionId)
  } catch {
    // Storage can be blocked; the first assistant opens instead.
  }
}

/** @returns the assistant the sidebar row opens: the one last shown here, else the first with a conversation. */
export function assistantToOpen(people: readonly Person[]): Person | undefined {
  let last: string | null = null
  try {
    last = localStorage.getItem(LAST_ASSISTANT_KEY)
  } catch {
    // Storage can be blocked; the first assistant opens instead.
  }
  const ready = people.filter(person => person.sessionId !== undefined)
  return ready.find(person => person.sessionId === last) ?? ready[0]
}
