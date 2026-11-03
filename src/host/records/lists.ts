/**
 * Lists: a named group of things ticked off one by one (`lists/<名>.md`).
 * Ticked items stay a week so a mistake can be undone, then go.
 * @module dsh-assisstant/host/records/lists
 */

import { joinLines, linesOf, matching, oneLine } from './text.ts'

export const LISTS_FOLDER = 'lists'

const ITEM = /^- \[( |x|X)\] (.+?)(?:（完成 (\d{4}-\d{2}-\d{2})）)?\s*$/u

/** How long a ticked item stays, in days. */
const DONE_KEEP_DAYS = 7

/** The changes one call makes. */
export interface ListEdit {
  readonly add?: readonly string[] | undefined
  readonly check?: readonly string[] | undefined
  readonly uncheck?: readonly string[] | undefined
  readonly remove?: readonly string[] | undefined
}

/** One parsed item, with its line. */
interface Item {
  readonly index: number
  readonly done: boolean
  readonly title: string
}

/** @returns every item of the file. */
function itemsOf(lines: readonly string[]): Item[] {
  return lines.flatMap((line, index) => {
    const match = ITEM.exec(line.trim())
    return match === null ? [] : [{ index, done: match[1] !== ' ', title: match[2] as string }]
  })
}

/** @returns the open and done item titles of a list file. */
export function readList(text: string): { open: string[]; done: string[] } {
  const items = itemsOf(linesOf(text))
  return { open: items.filter(item => !item.done).map(item => item.title), done: items.filter(item => item.done).map(item => item.title) }
}

/** @returns a line for an item. */
function lineOf(title: string, today?: string): string {
  return today === undefined ? `- [ ] ${title}` : `- [x] ${title}（完成 ${today}）`
}

/** @returns the date that many days before. */
function daysBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Apply one call's changes.
 * @param text - the file, undefined when absent.
 * @param name - the list's name.
 * @param edit - the changes.
 * @param today - the local date, "YYYY-MM-DD".
 * @returns the new text, and any phrases that matched nothing.
 */
export function editList(text: string | undefined, name: string, edit: ListEdit, today: string): { text: string; missing: string[] } {
  const lines = linesOf(text ?? `# ${name}\n`)
  const missing: string[] = []
  const change = (phrases: readonly string[] | undefined, among: (item: Item) => boolean, apply: (item: Item) => string | undefined): void => {
    for (const phrase of phrases ?? []) {
      const found = matching(itemsOf(lines).filter(among), phrase, item => item.title)[0]
      if (found === undefined) {
        missing.push(phrase)
        continue
      }
      const next = apply(found)
      if (next === undefined) lines.splice(found.index, 1)
      else lines[found.index] = next
    }
  }
  change(edit.check, item => !item.done, item => lineOf(item.title, today))
  change(edit.uncheck, item => item.done, item => lineOf(item.title))
  change(edit.remove, () => true, () => undefined)
  for (const raw of edit.add ?? []) {
    const title = oneLine(raw)
    if (title === '') continue
    // The same thing again: it is open once more, not a second line.
    const existing = itemsOf(lines).find(item => item.title.toLowerCase() === title.toLowerCase())
    if (existing !== undefined) {
      lines[existing.index] = lineOf(existing.title)
      continue
    }
    const last = itemsOf(lines).at(-1)?.index
    if (last === undefined) lines.push('', lineOf(title))
    else lines.splice(last + 1, 0, lineOf(title))
  }
  const cutoff = daysBefore(today, DONE_KEEP_DAYS)
  const kept = lines.filter((line) => {
    const doneOn = ITEM.exec(line.trim())?.[3]
    return doneOn === undefined || doneOn >= cutoff
  })
  return { text: joinLines(kept), missing }
}
