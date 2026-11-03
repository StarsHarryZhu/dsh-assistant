/**
 * The profile (`profile.md`): what the assistant should always know about its
 * family member, one line per field, read in full on every turn and therefore
 * held to a length limit. The model writes it for itself, so it is in English.
 * @module dsh-assisstant/host/records/profile
 */

import { joinLines, lastIndexWhere, linesOf, oneLine } from './text.ts'

export const PROFILE_FILE = 'profile.md'

/** The fields of a profile, in file order. */
export const PROFILE_FIELDS = ['Form of address', 'Health and diet', 'Likes', 'Dislikes', 'Important dates', 'Routines and habits', 'Other'] as const

/** One field. */
export type ProfileField = (typeof PROFILE_FIELDS)[number]

/** @returns a new profile. */
function template(): string {
  return `# Profile\n\n${PROFILE_FIELDS.map(field => `- ${field}:`).join('\n')}\n`
}

/**
 * Add to a field or replace it.
 * @param text - the file, undefined when absent.
 * @param field - the field.
 * @param value - the fact, or the whole new line when replacing.
 * @param mode - `add` keeps what is there; `replace` overwrites it (an empty value clears it).
 * @returns the new text.
 */
export function setProfileField(text: string | undefined, field: ProfileField, value: string, mode: 'add' | 'replace'): string {
  const lines = linesOf(text ?? template())
  const prefix = `- ${field}:`
  const fact = oneLine(value)
  const index = lines.findIndex(line => line.trim().startsWith(prefix))
  if (index < 0) {
    const last = lastIndexWhere(lines, line => line.trim().startsWith('- '))
    lines.splice(last < 0 ? lines.length : last + 1, 0, `${prefix} ${fact}`.trimEnd())
    return joinLines(lines)
  }
  const current = (lines[index] as string).trim().slice(prefix.length).trim()
  const merged = mode === 'replace' || current === ''
    ? fact
    : current.split('; ').includes(fact) || fact === '' ? current : `${current}; ${fact}`
  lines[index] = `${prefix} ${merged}`.trimEnd()
  return joinLines(lines)
}
