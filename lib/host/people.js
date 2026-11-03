/**
 * Planning for the assistant list: which people still need a conversation, who
 * was removed, and how the host's write-back merges into whatever the page
 * stored meanwhile.
 * @module dsh-assisstant/host/people
 */
import { SYSTEM_PREFIX } from "./watchdog.js";
/**
 * The note a new assistant's conversation starts with. The host's conversation
 * view shows a session that has not run a turn as a blank page, with no title
 * or tabs and a composer that asks for a workspace first, so the assistant
 * speaks first.
 * @returns the system note.
 */
export function greetingText() {
    return `${SYSTEM_PREFIX} 这是你和家人第一次见面。用一两句白话打个招呼：说你叫什么，能帮着记日程、记事情、办杂事。不要提这是系统消息。`;
}
/** @returns the people that still need a conversation and have a folder to hold it. */
export function needingSessions(people) {
    return people.filter((person) => person.sessionId === undefined && person.cwd !== undefined);
}
/**
 * @param previous - the list before a change.
 * @param next - the list after it.
 * @returns the people in `previous` whose id is gone from `next`.
 */
export function removedPeople(previous, next) {
    const kept = new Set(next.map(person => person.id));
    return previous.filter(person => !kept.has(person.id));
}
/**
 * Apply the host's findings to the latest stored list. Only people still in
 * that list are touched, so a person the page deleted meanwhile stays deleted.
 * @param latest - the list as stored now.
 * @param updates - person id → fields to set.
 * @returns the merged list, or undefined when nothing changes.
 */
export function mergePeople(latest, updates) {
    let changed = false;
    const merged = latest.map((person) => {
        const update = updates.get(person.id);
        if (update === undefined)
            return person;
        const next = { ...person, ...update };
        if (next.sessionId !== person.sessionId)
            changed = true;
        return next;
    });
    return changed ? merged : undefined;
}
