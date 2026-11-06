/**
 * Planning for the assistant list: which people still need a conversation, who
 * was removed, and how the host's write-back merges into whatever the page
 * stored meanwhile.
 * @module dsh-assisstant/host/people
 */

import type { Person } from '../shared/settings.ts'
import { SYSTEM_PREFIX } from './watchdog.ts'

/**
 * The note a new assistant's conversation starts with. The host's conversation
 * view shows a session that has not run a turn as a blank page, with no title
 * or tabs and a composer that asks for a workspace first, so the assistant
 * speaks first. It also works out the user's time zone from what they wrote when
 * creating it, or asks.
 * @param person - the new assistant.
 * @returns the system note.
 */
export function greetingText(person: Pick<Person, 'zoneHint'>): string {
  const zone = person.zoneHint === undefined
    ? 'You do not know their time zone yet: ask in the same message, in one short question, where they are.'
    : `Asked where they are, they wrote: "${person.zoneHint}". Think about which IANA time zone that means, and record it first with profile_set (field Time zone). When it really cannot be told, ask in one short question instead.`
  return `${SYSTEM_PREFIX} This is your first meeting with the user. ${zone} Then say hello in one or two plain sentences: your name, and that you can keep their schedule, note things down, and run errands. Do not mention that this is a system message.`
}

/**
 * The note an assistant gets when a WeChat account has just been bound to it,
 * first or again.
 * @returns the system note.
 */
export function introductionText(): string {
  return `${SYSTEM_PREFIX} The user has just connected their WeChat to you. Send them a short introduction there with im_send, right now: one or two plain sentences with your name, and that they can talk to you there just as here. They did this themselves, so quiet hours do not apply. Write nothing else, and do not mention that this is a system message.`
}

/** @returns the people that still need a conversation and have a folder to hold it. */
export function needingSessions(people: readonly Person[]): (Person & { readonly cwd: string })[] {
  return people.filter((person): person is Person & { readonly cwd: string } => person.sessionId === undefined && person.cwd !== undefined)
}

/**
 * @param previous - the list before a change.
 * @param next - the list after it.
 * @returns the people in `previous` whose id is gone from `next`.
 */
export function removedPeople(previous: readonly Person[], next: readonly Person[]): Person[] {
  const kept = new Set(next.map(person => person.id))
  return previous.filter(person => !kept.has(person.id))
}

/**
 * Apply the host's findings to the latest stored list. Only people still in
 * that list are touched, so a person the page deleted meanwhile stays deleted.
 * @param latest - the list as stored now.
 * @param updates - person id → fields to set.
 * @returns the merged list, or undefined when nothing changes.
 */
export function mergePeople(latest: readonly Person[], updates: ReadonlyMap<string, Pick<Person, 'sessionId'>>): Person[] | undefined {
  let changed = false
  const merged = latest.map((person) => {
    const update = updates.get(person.id)
    if (update === undefined) return person
    const next = { ...person, ...update }
    if (next.sessionId !== person.sessionId) changed = true
    return next
  })
  return changed ? merged : undefined
}
