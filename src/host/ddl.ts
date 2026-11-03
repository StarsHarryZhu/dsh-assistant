/**
 * The fast path over `ddl.md`: parse the schedule file and render it in the
 * family member's time zone without calling a model. The router reads the
 * result as inline context, `/ddl` shows it directly, the daily brief decides
 * from it whether there is anything to say today, and the calendar tools
 * (records/calendar.ts) edit the file with these same shapes.
 *
 * Line formats:
 * - one item: `- [ ] 2026-10-28T18:00Z · 日程 · 标题（备注）`, a span
 *   `start – end`, or `无日期` for the time; a done line starts `- [x]` and ends
 *   `（完成 …）`. Times are UTC.
 * - a repeating item: `- 每周一三 19:00 · 日程 · 标题`, with 每天, 每周<days>,
 *   每月<n>日, or 每年<m>月<n>日, and an optional time in the family member's
 *   own clock, so it follows them across zones.
 * @module dsh-assisstant/host/ddl
 */

import { localDays, weekdayOf } from './calendar.ts'
import type { LocalDay } from './calendar.ts'

/** How an item repeats. Weekdays are ISO: Monday 1 through Sunday 7. */
export type RepeatRule =
  | { readonly kind: 'daily' }
  | { readonly kind: 'weekly'; readonly weekdays: readonly number[] }
  | { readonly kind: 'monthly'; readonly day: number }
  | { readonly kind: 'yearly'; readonly month: number; readonly day: number }

/** A repeating item's rule and its optional local `HH:MM`. */
export interface Repeat {
  readonly rule: RepeatRule
  readonly time?: string
}

/** One parsed line of `ddl.md`. */
export interface DdlEntry {
  readonly done: boolean
  /** Start (or the only time), epoch ms; undefined for an undated or repeating entry. */
  readonly start?: number
  /** End of a span, epoch ms. */
  readonly end?: number
  /** Set on a repeating entry, which is never done. */
  readonly repeat?: Repeat
  /** `DDL`, `日程`, or `项目` (anything else is read as DDL). */
  readonly kind: string
  readonly title: string
}

const UTC_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})Z$/u
const LINE = /^- \[( |x|X)\] (.+?) · ([^·]+?) · (.+)$/u
const REPEAT_LINE = /^- (每天|每周[一二三四五六日]+|每月\d{1,2}日|每年\d{1,2}月\d{1,2}日)(?: (\d{2}:\d{2}))? · ([^·]+?) · (.+)$/u
const DONE_SUFFIX = /（完成 [^）]*）\s*$/u

/** The Chinese weekday characters, Monday first. */
const WEEKDAY_CHARS = '一二三四五六日'

/** @returns how a repeat rule reads in the file and to the family: "每周一三". */
export function ruleText(rule: RepeatRule): string {
  switch (rule.kind) {
    case 'daily': return '每天'
    case 'weekly': return `每周${[...rule.weekdays].sort((a, b) => a - b).map(day => WEEKDAY_CHARS[day - 1]).join('')}`
    case 'monthly': return `每月${rule.day}日`
    case 'yearly': return `每年${rule.month}月${rule.day}日`
  }
}

/** @returns the rule the text names, or undefined when out of range. */
function parseRule(text: string): RepeatRule | undefined {
  if (text === '每天') return { kind: 'daily' }
  if (text.startsWith('每周')) {
    return { kind: 'weekly', weekdays: [...new Set([...text.slice(2)].map(char => WEEKDAY_CHARS.indexOf(char) + 1))].sort((a, b) => a - b) }
  }
  const yearly = /^每年(\d+)月(\d+)日$/u.exec(text)
  if (yearly !== null) {
    const month = Number(yearly[1])
    const day = Number(yearly[2])
    return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { kind: 'yearly', month, day } : undefined
  }
  const day = Number(/^每月(\d+)日$/u.exec(text)?.[1])
  return day >= 1 && day <= 31 ? { kind: 'monthly', day } : undefined
}

/**
 * @param rule - a repeat rule.
 * @param iso - a local date, "YYYY-MM-DD".
 * @returns whether the rule falls on that date. A day the month does not have is skipped.
 */
export function repeatsOn(rule: RepeatRule, iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number]
  switch (rule.kind) {
    case 'daily': return true
    case 'weekly': return rule.weekdays.includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7)
    case 'monthly': return rule.day === day
    case 'yearly': return rule.month === month && rule.day === day
  }
}

/** @returns the UTC instant, or undefined when the text is not `YYYY-MM-DDTHH:MMZ`. */
function parseUtc(text: string): number | undefined {
  const match = UTC_TIME.exec(text.trim())
  if (match === null) return undefined
  const [, year, month, day, hour, minute] = match.map(Number) as [number, number, number, number, number, number]
  const value = Date.UTC(year, month - 1, day, hour, minute)
  // Date.UTC rolls an out-of-range field over; a real time reads back the same.
  const date = new Date(value)
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute
    ? value
    : undefined
}

/**
 * Parse `ddl.md`.
 * @param text - the file.
 * @returns every well-formed entry in file order; other lines are skipped.
 */
export function parseDdl(text: string): DdlEntry[] {
  const entries: DdlEntry[] = []
  for (const raw of text.split('\n')) {
    const repeating = REPEAT_LINE.exec(raw.trim())
    if (repeating !== null) {
      const [, ruleName, time, kind, title] = repeating as unknown as [string, string, string | undefined, string, string]
      const rule = parseRule(ruleName)
      if (rule !== undefined) entries.push({ done: false, repeat: time === undefined ? { rule } : { rule, time }, kind: kind.trim(), title: title.trim() })
      continue
    }
    const match = LINE.exec(raw.trim())
    if (match === null) continue
    const [, mark, time, kind, rest] = match as unknown as [string, string, string, string, string]
    const title = rest.replace(DONE_SUFFIX, '').trim()
    if (title === '') continue
    const done = mark !== ' '
    if (time.trim() === '无日期') {
      entries.push({ done, kind: kind.trim(), title })
      continue
    }
    const [from, to] = time.split('–').map(part => part.trim())
    const start = parseUtc(from ?? '')
    if (start === undefined) continue
    const end = to === undefined ? undefined : parseUtc(to)
    entries.push({ done, start, ...(end === undefined ? {} : { end }), kind: kind.trim(), title })
  }
  return entries
}

/** One instant in a zone. */
interface LocalTime {
  readonly iso: string
  readonly short: string
  readonly time: string
}

/** @returns the zone's date and 24-hour time at that instant. */
export function local(ms: number, zone: string): LocalTime {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map(part => [part.type, part.value]))
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, short: `${parts.month}/${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

/** @returns the zone's offset from UTC at that instant, in milliseconds. */
function offsetAt(ms: number, zone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map(part => [part.type, Number(part.value)]))
  const wall = Date.UTC(parts.year as number, (parts.month as number) - 1, parts.day as number, parts.hour as number, parts.minute as number)
  return wall - Math.floor(ms / 60_000) * 60_000
}

/**
 * The instant of a local date and time. A time a clock change repeats reads as
 * the earlier one; a time it skips moves forward by the gap.
 * @param date - "YYYY-MM-DD".
 * @param time - "HH:MM".
 * @param zone - an IANA zone.
 * @returns epoch milliseconds.
 */
export function zonedToUtc(date: string, time: string, zone: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const [hour, minute] = time.split(':').map(Number) as [number, number]
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  const before = wall - offsetAt(wall - 86_400_000, zone)
  const after = wall - offsetAt(wall + 86_400_000, zone)
  const valid = [before, after].filter((candidate) => {
    const seen = local(candidate, zone)
    return seen.iso === date && seen.time === time
  })
  return valid.length === 0 ? before : Math.min(...valid)
}

/** @returns the symbol for a kind. */
function symbol(kind: string): string {
  if (kind === '日程') return '📅'
  if (kind === '项目') return '📁'
  return '📝'
}

/** An entry placed on one local day of the window. */
interface Placed {
  readonly entry: DdlEntry
  readonly day: string
  readonly label: string
  readonly allDay: boolean
  /** The instant it sorts by within the day. */
  readonly at: number
}

/** @returns how the entry reads on the day it is listed: "📅 09:00 组会（至 10/31）". */
function placeLabel(entry: DdlEntry, zone: string, day: string): { label: string; allDay: boolean } {
  const start = local(entry.start as number, zone)
  const end = entry.end === undefined ? undefined : local(entry.end, zone)
  const allDay = entry.kind === '日程' && end !== undefined && start.time === '00:00' && end.time === '23:59'
  const startedEarlier = start.iso < day
  const time = allDay || startedEarlier ? '全天' : start.time
  const until = end !== undefined && end.iso !== day ? `（至 ${end.short}）` : ''
  return { label: `${symbol(entry.kind)} ${time} ${entry.title}${until}`, allDay: allDay || startedEarlier }
}

/** @returns a repeating entry placed on one day: "📅 19:00 钢琴课（每周三）". */
function placeRepeat(entry: DdlEntry, day: string, zone: string): Placed {
  const repeat = entry.repeat as Repeat
  const time = repeat.time ?? '全天'
  return {
    entry,
    day,
    label: `${symbol(entry.kind)} ${time} ${entry.title}（${ruleText(repeat.rule)}）`,
    allDay: repeat.time === undefined,
    at: zonedToUtc(day, repeat.time ?? '00:00', zone),
  }
}

/** The window's days and the open entries placed on them. */
interface Week {
  readonly days: readonly LocalDay[]
  readonly placed: readonly Placed[]
  readonly undated: readonly DdlEntry[]
  readonly later: number
}

/** @returns the open entries of the next seven local days, placed on their first day inside the window. */
function week(entries: readonly DdlEntry[], now: Date, zone: string): Week {
  const days = localDays(now, zone, 6)
  const first = (days[0] as LocalDay).iso
  const last = (days[days.length - 1] as LocalDay).iso
  const placed: Placed[] = []
  let later = 0
  for (const entry of entries) {
    if (entry.repeat !== undefined) {
      for (const { iso } of days) if (repeatsOn(entry.repeat.rule, iso)) placed.push(placeRepeat(entry, iso, zone))
      continue
    }
    if (entry.done || entry.start === undefined) continue
    const startDay = local(entry.start, zone).iso
    const endDay = entry.end === undefined ? startDay : local(entry.end, zone).iso
    if (endDay < first) continue
    if (startDay > last) {
      later += 1
      continue
    }
    const day = startDay < first ? first : startDay
    placed.push({ entry, day, at: entry.start, ...placeLabel(entry, zone, day) })
  }
  placed.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)
    || Number(b.allDay) - Number(a.allDay)
    || a.at - b.at)
  return { days, placed, undated: entries.filter(entry => !entry.done && entry.start === undefined && entry.repeat === undefined), later }
}

/**
 * The plain-text week view `/ddl` shows: one block per day, then undated
 * items, items done this week, and how many open items come later.
 * @param entries - the parsed file.
 * @param now - the current instant.
 * @param zone - the family member's IANA zone.
 * @returns Markdown.
 */
export function weekView(entries: readonly DdlEntry[], now: Date, zone: string): string {
  const { days, placed, undated, later } = week(entries, now, zone)
  const first = days[0] as LocalDay
  const last = days[days.length - 1] as LocalDay
  const lines = [`**未来一周 · ${first.short} ${first.weekday} – ${last.short} ${last.weekday}**`, '']
  for (const [index, day] of days.entries()) {
    const items = placed.filter(item => item.day === day.iso)
    const heading = `${day.short} ${day.weekday}${index === 0 ? '（今天）' : ''}`
    if (items.length === 0) {
      lines.push(`- ${heading} · 无`)
      continue
    }
    lines.push(`- ${heading}`)
    for (const item of items) lines.push(`  - ${item.label}`)
  }
  if (undated.length > 0) {
    lines.push('', '**未定日期**')
    for (const entry of undated) lines.push(`- ${symbol(entry.kind)} ${entry.title}`)
  }
  const doneThisWeek = entries.filter((entry) => {
    if (!entry.done) return false
    if (entry.start === undefined) return true
    const day = local(entry.start, zone).iso
    return day >= first.iso && day <= last.iso
  })
  lines.push('', '**已完成**')
  if (doneThisWeek.length === 0) {
    lines.push('- 暂无')
  } else {
    for (const entry of doneThisWeek) {
      if (entry.start === undefined) {
        lines.push(`- 未定日期 · ${symbol(entry.kind)} ${entry.title}`)
        continue
      }
      const at = local(entry.start, zone)
      const weekday = days.find(day => day.iso === at.iso)?.weekday ?? ''
      lines.push(`- ${at.short} ${weekday} ${symbol(entry.kind)} ${at.time} ${entry.title}`)
    }
  }
  if (later > 0) lines.push('', `一周之后还有 ${later} 项待完成。`)
  return lines.join('\n')
}

/**
 * @param entry - a one-off entry with a start.
 * @param zone - the family member's IANA zone.
 * @returns whether it is a whole-day 日程, stored as 00:00–23:59 local.
 */
export function isAllDay(entry: DdlEntry, zone: string): boolean {
  if (entry.kind !== '日程' || entry.start === undefined || entry.end === undefined) return false
  return local(entry.start, zone).time === '00:00' && local(entry.end, zone).time === '23:59'
}

/**
 * One entry on one line, in the family member's time, as tool results and
 * searches show it: "11/05 周四 14:30 · 日程 · 看牙医".
 * @param entry - the entry.
 * @param zone - the family member's IANA zone.
 * @returns the line.
 */
export function describeEntry(entry: DdlEntry, zone: string): string {
  const tail = `${entry.kind} · ${entry.title}`
  if (entry.repeat !== undefined) return `${ruleText(entry.repeat.rule)}${entry.repeat.time === undefined ? '' : ` ${entry.repeat.time}`} · ${tail}`
  if (entry.start === undefined) return `未定日期 · ${tail}`
  const start = local(entry.start, zone)
  const allDay = isAllDay(entry, zone)
  const from = `${start.short} ${weekdayOf(start.iso)}${allDay ? ' 全天' : ` ${start.time}`}`
  if (entry.end === undefined) return `${from} · ${tail}`
  const end = local(entry.end, zone)
  if (allDay) return `${end.iso === start.iso ? from : `${from} 至 ${end.short} ${weekdayOf(end.iso)}`} · ${tail}`
  return `${from}–${end.iso === start.iso ? end.time : `${end.short} ${end.time}`} · ${tail}`
}

/**
 * Today's open items, as the daily brief lists them. Items repeating every day
 * stay out: they have their own reminders, and would make every day a brief day.
 * @param entries - the parsed file.
 * @param now - the current instant.
 * @param zone - the family member's IANA zone.
 * @returns one label per item, empty when today is free.
 */
export function todayItems(entries: readonly DdlEntry[], now: Date, zone: string): string[] {
  const { days, placed } = week(entries, now, zone)
  const today = (days[0] as LocalDay).iso
  return placed.filter(item => item.day === today && item.entry.repeat?.rule.kind !== 'daily').map(item => item.label)
}
