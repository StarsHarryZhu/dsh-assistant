/**
 * Memos: facts looked up when needed (`memo.md`), one per line, keyed by a
 * short name, a new value replacing the old: where the keys are, a neighbor's
 * phone number. Only the names reach the model's context.
 * @module dsh-assisstant/host/records/memos
 */

import { joinLines, lastIndexWhere, linesOf, oneLine } from './text.ts'

export const MEMO_FILE = 'memo.md'

/** Longest memo name. */
export const MAX_KEY_CHARS = 60

/** Longest memo value. */
export const MAX_VALUE_CHARS = 1000

const LINE = /^- (.+?)：(.*)（(\d{4}-\d{2}-\d{2})）\s*$/u

/** One memo. */
export interface Memo {
  readonly key: string
  readonly value: string
  readonly date: string
}

/** @returns every memo in the file. */
export function readMemos(text: string): Memo[] {
  return linesOf(text).flatMap((line) => {
    const match = LINE.exec(line.trim())
    return match === null ? [] : [{ key: match[1] as string, value: match[2] as string, date: match[3] as string }]
  })
}

/**
 * Write, replace, or (with an empty value) delete a memo.
 * @param text - the file, undefined when absent.
 * @param key - the memo's name.
 * @param value - the new value.
 * @param today - the local date, "YYYY-MM-DD".
 * @returns the new text and what happened.
 */
export function setMemo(text: string | undefined, key: string, value: string, today: string): { text: string; outcome: 'added' | 'replaced' | 'deleted' | 'missing' } {
  const name = oneLine(key).replaceAll('：', ':')
  const body = oneLine(value)
  const lines = linesOf(text ?? '# Memos\n')
  const index = lines.findIndex(line => LINE.exec(line.trim())?.[1]?.toLowerCase() === name.toLowerCase())
  if (body === '') {
    if (index >= 0) lines.splice(index, 1)
    return { text: joinLines(lines), outcome: index >= 0 ? 'deleted' : 'missing' }
  }
  const line = `- ${name}：${body}（${today}）`
  if (index >= 0) {
    lines[index] = line
    return { text: joinLines(lines), outcome: 'replaced' }
  }
  const last = lastIndexWhere(lines, entry => LINE.test(entry.trim()))
  if (last < 0) lines.push('', line)
  else lines.splice(last + 1, 0, line)
  return { text: joinLines(lines), outcome: 'added' }
}
