/**
 * Looking up what is recorded: one category or all of them, by name, date
 * range, or keywords, with schedule times in the family member's own clock.
 * @module dsh-assisstant/host/records/recall
 */

import { describeEntry, local, parseDdl, repeatsOn } from '../ddl.ts'
import type { DdlEntry } from '../ddl.ts'
import { CALENDAR_FILE } from './calendar.ts'
import { LISTS_FOLDER, readList } from './lists.ts'
import { LOGS_FOLDER, readLog } from './logs.ts'
import { MEMO_FILE, readMemos } from './memos.ts'
import { PROJECTS_FOLDER } from './projects.ts'
import type { RecordStore } from './store.ts'
import { namedFile } from './store.ts'

/** The categories a lookup can name. */
export const RECALL_KINDS = ['calendar', 'list', 'memo', 'log', 'project'] as const

/** One category. */
export type RecallKind = (typeof RECALL_KINDS)[number]

/** What to look up. */
export interface RecallQuery {
  readonly kind?: RecallKind | undefined
  /** A list's, log's, or project's name. */
  readonly name?: string | undefined
  /** Keywords; a line must contain all of them. */
  readonly query?: string | undefined
  /** Local dates, "YYYY-MM-DD", for the schedule and logs. */
  readonly from?: string | undefined
  readonly to?: string | undefined
}

/** Longest result. */
const MAX_CHARS = 6000

/** Latest entries a log shows when nothing narrows it. */
const LOG_TAIL = 30

/** Most days a date range is searched for repeating items. */
const MAX_RANGE_DAYS = 366

/** @returns a test for lines containing every keyword, ignoring case. */
function keywordTest(query: string | undefined): (line: string) => boolean {
  const words = (query ?? '').toLowerCase().split(/\s+/u).filter(Boolean)
  return line => words.every(word => line.toLowerCase().includes(word))
}

/** @returns whether a repeating item falls within the range. */
function repeatsWithin(entry: DdlEntry, from: string, to: string): boolean {
  const start = Date.parse(`${from}T00:00Z`)
  for (let day = 0; day < MAX_RANGE_DAYS; day += 1) {
    const iso = new Date(start + day * 86_400_000).toISOString().slice(0, 10)
    if (iso > to) return false
    if (entry.repeat !== undefined && repeatsOn(entry.repeat.rule, iso)) return true
  }
  return true
}

/** @returns the schedule's lines in the range. */
function calendarLines(store: RecordStore, query: RecallQuery, zone: string, now: number): string[] {
  const from = query.from ?? '0000-01-01'
  const to = query.to ?? '9999-12-31'
  const today = local(now, zone).iso
  return parseDdl(store.read(CALENDAR_FILE) ?? '').flatMap((entry) => {
    if (entry.repeat !== undefined) {
      const within = query.from === undefined && query.to === undefined ? true : repeatsWithin(entry, query.from ?? today, to)
      return within ? [describeEntry(entry, zone)] : []
    }
    if (entry.start !== undefined) {
      if (local(entry.end ?? entry.start, zone).iso < from || local(entry.start, zone).iso > to) return []
    } else if (query.from !== undefined || query.to !== undefined) {
      return []
    }
    return [`${describeEntry(entry, zone)}${entry.done ? ' (done)' : ''}`]
  })
}

/** @returns each list's items, or one list's. */
function listLines(store: RecordStore, name: string | undefined): string[] {
  const names = name === undefined ? store.names(LISTS_FOLDER) : [name]
  return names.flatMap((list) => {
    const text = store.read(namedFile(LISTS_FOLDER, list))
    if (text === undefined) return []
    const { open, done } = readList(text)
    return [...open.map(item => `${list}: ${item}`), ...done.map(item => `${list}: ${item} (ticked off)`)]
  })
}

/** @returns each log's entries, or one log's: its latest ones when nothing narrows it. */
function logLines(store: RecordStore, query: RecallQuery): string[] {
  const names = query.name === undefined ? store.names(LOGS_FOLDER) : [query.name]
  return names.flatMap((log) => {
    const text = store.read(namedFile(LOGS_FOLDER, log))
    if (text === undefined) return []
    const entries = readLog(text).filter(entry => (query.from === undefined || entry.at.slice(0, 10) >= query.from) && (query.to === undefined || entry.at.slice(0, 10) <= query.to))
    const narrowed = query.from !== undefined || query.to !== undefined || query.query !== undefined
    const shown = narrowed ? entries : entries.slice(-LOG_TAIL)
    return [
      ...(shown.length < entries.length ? [`${log}: (${entries.length - shown.length} earlier entries not shown)`] : []),
      ...shown.map(entry => `${log}: ${entry.at} ${entry.text}`),
    ]
  })
}

/** @returns each project's lines, or one project's. */
function projectLines(store: RecordStore, name: string | undefined): string[] {
  const names = name === undefined ? store.names(PROJECTS_FOLDER) : [name]
  return names.flatMap(project => (store.read(namedFile(PROJECTS_FOLDER, project)) ?? '').split('\n')
    .filter(line => line.trim() !== '' && !line.startsWith('# '))
    .map(line => `${project}: ${line.trim()}`))
}

/**
 * Look something up.
 * @param store - the family member's records.
 * @param query - what to look up.
 * @param zone - the family member's IANA zone.
 * @param now - the current instant.
 * @returns plain text for the model.
 */
export function recall(store: RecordStore, query: RecallQuery, zone: string, now: number): string {
  const wanted = (kind: RecallKind): boolean => query.kind === undefined || query.kind === kind
  const matches = keywordTest(query.query)
  const sections: [string, string[]][] = [
    ['Schedule', wanted('calendar') ? calendarLines(store, query, zone, now) : []],
    ['Lists', wanted('list') ? listLines(store, query.name) : []],
    ['Memos', wanted('memo') ? readMemos(store.read(MEMO_FILE) ?? '').map(memo => `${memo.key}: ${memo.value} (recorded ${memo.date})`) : []],
    ['Logs', wanted('log') ? logLines(store, query) : []],
    ['Projects', wanted('project') ? projectLines(store, query.name) : []],
  ]
  const blocks = sections.flatMap(([heading, lines]) => {
    const kept = lines.filter(matches)
    return kept.length === 0 ? [] : [`## ${heading}\n${kept.map(line => `- ${line}`).join('\n')}`]
  })
  if (blocks.length === 0) return 'Nothing in the records matches.'
  const text = blocks.join('\n\n')
  return text.length <= MAX_CHARS ? text : `${text.slice(0, MAX_CHARS)}\n… (cut here: the result is too long; narrow the search)`
}
