/**
 * Planning for the assistant list: which people still need a conversation, who
 * was removed, and how the host's write-back merges into whatever the page
 * stored meanwhile.
 * @module dsh-assisstant/host/people
 */
import type { Person } from '../shared/settings.ts';
/**
 * The note a new assistant's conversation starts with. The host's conversation
 * view shows a session that has not run a turn as a blank page, with no title
 * or tabs and a composer that asks for a workspace first, so the assistant
 * speaks first. It also works out the user's time zone from what they wrote when
 * creating it, or asks.
 * @param person - the new assistant.
 * @returns the system note.
 */
export declare function greetingText(person: Pick<Person, 'zoneHint'>): string;
/**
 * The note an assistant gets when a WeChat account has just been bound to it,
 * first or again.
 * @returns the system note.
 */
export declare function introductionText(): string;
/** @returns the people that still need a conversation and have a folder to hold it. */
export declare function needingSessions(people: readonly Person[]): (Person & {
    readonly cwd: string;
})[];
/**
 * @param previous - the list before a change.
 * @param next - the list after it.
 * @returns the people in `previous` whose id is gone from `next`.
 */
export declare function removedPeople(previous: readonly Person[], next: readonly Person[]): Person[];
/**
 * Apply the host's findings to the latest stored list. Only people still in
 * that list are touched, so a person the page deleted meanwhile stays deleted.
 * @param latest - the list as stored now.
 * @param updates - person id → fields to set.
 * @returns the merged list, or undefined when nothing changes.
 */
export declare function mergePeople(latest: readonly Person[], updates: ReadonlyMap<string, Pick<Person, 'sessionId'>>): Person[] | undefined;
