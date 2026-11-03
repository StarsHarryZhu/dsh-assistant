/**
 * The calendar the model reads every assembly, the `/ddl` week window, and the
 * session projection that remembers the user's latest browser time zone.
 * Ported from assistant-mode (`my_plugins/dsh-assisstant/lib/index.js`) with a
 * projection key of its own, so both plugins can be installed together.
 * @module dsh-assisstant/host/calendar
 */

/** Session projection key holding the user's latest browser time zone. */
export const ZONE_KEY = 'dshAssisstantTimeZone'

/** How many days after today the calendar context lists. */
const CALENDAR_DAYS = 14

/** How many days after today the /ddl window covers (today plus six). */
const WEEK_DAYS = 6

/** Chinese weekday names indexed by `Date#getUTCDay()`. */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** One local day of the calendar. */
export interface LocalDay {
  readonly iso: string
  readonly short: string
  readonly weekday: string
  readonly offset: string
}

/**
 * @param value - a candidate IANA zone name.
 * @returns the name when the runtime accepts it unchanged, else undefined.
 */
export function validZone(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone === value ? value : undefined
  } catch {
    return undefined
  }
}

/** @returns the host process time zone. */
export function processZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Read the browser zone the host stamps on an ordinary web user message
 * (`source.clientTimeZone`, see dsh-time-context's request-zone.ts).
 * @param source - a user message's source.
 * @returns the validated zone, or undefined.
 */
export function clientZone(source: unknown): string | undefined {
  if (source === null || typeof source !== 'object') return undefined
  const record = source as { kind?: unknown; clientTimeZone?: unknown }
  if (record.kind !== 'user') return undefined
  return validZone(record.clientTimeZone)
}

/** State of {@link zoneProjection}. */
export interface ZoneState {
  readonly timeZone: string | null
}

/**
 * Host-only projection: the latest valid browser zone seen in the session.
 * The fold returns the same state reference for every event it ignores.
 */
export const zoneProjection = {
  key: ZONE_KEY,
  stateVersion: 1,
  stateSchema: {
    parse(value: unknown): ZoneState {
      const zone = value !== null && typeof value === 'object' ? (value as { timeZone?: unknown }).timeZone : undefined
      if (zone === null || typeof zone === 'string') return { timeZone: zone }
      throw new TypeError(`${ZONE_KEY}: expected { timeZone: string | null }`)
    },
  },
  init: (): ZoneState => ({ timeZone: null }),
  apply(state: ZoneState, event: { type: string; data?: { source?: unknown } }): ZoneState {
    if (event.type !== 'user/message') return state
    const zone = clientZone(event.data?.source)
    return zone === undefined || zone === state.timeZone ? state : { timeZone: zone }
  },
}

/** @returns the zone's calendar date at that instant. */
function localDate(date: Date, zone: string): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(date).map(part => [part.type, part.value]))
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) }
}

/** @returns the zone's UTC offset at that instant, as "UTC-04:00". */
function offsetAt(date: Date, zone: string): string {
  const label = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(date).find(part => part.type === 'timeZoneName')?.value ?? 'GMT'
  return label === 'GMT' ? 'UTC+00:00' : label.replace('GMT', 'UTC')
}

/**
 * The zone's local days from today on. Each day is anchored at UTC noon of
 * that calendar date, so the date arithmetic never depends on the zone.
 * @param now - the current instant.
 * @param zone - an IANA zone.
 * @param count - days after today to include.
 * @returns today and the following days.
 */
export function localDays(now: Date, zone: string, count: number): LocalDay[] {
  const today = localDate(now, zone)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return Array.from({ length: count + 1 }, (_, index) => {
    const noon = new Date(Date.UTC(today.year, today.month - 1, today.day + index, 12))
    return {
      iso: `${noon.getUTCFullYear()}-${pad(noon.getUTCMonth() + 1)}-${pad(noon.getUTCDate())}`,
      short: `${pad(noon.getUTCMonth() + 1)}/${pad(noon.getUTCDate())}`,
      weekday: WEEKDAYS[noon.getUTCDay()] as string,
      offset: offsetAt(noon, zone),
    }
  })
}

/** @returns the Chinese weekday of a calendar date, "YYYY-MM-DD". */
export function weekdayOf(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number]
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] as string
}

/** @returns the /ddl window, as "10/26 周一 – 11/01 周日". */
export function weekLabel(now: Date, zone: string): string {
  const days = localDays(now, zone, WEEK_DAYS)
  const first = days[0] as LocalDay
  const last = days[days.length - 1] as LocalDay
  return `${first.short} ${first.weekday} – ${last.short} ${last.weekday}`
}

/**
 * The calendar context. It changes only when the local date or the zone
 * changes, so it adds no snapshot per step.
 * @param now - the current instant.
 * @param zone - the user's current IANA zone.
 * @returns the context text.
 */
export function calendarText(now: Date, zone: string): string {
  const days = localDays(now, zone, CALENDAR_DAYS)
  const [today, ...rest] = days as [LocalDay, ...LocalDay[]]
  const upcoming = rest.map((day, index) => {
    const before = index === 0 ? today : rest[index - 1] as LocalDay
    const shift = day.offset === before.offset ? '' : ` (${day.offset} from this day)`
    return `${day.iso} ${day.weekday}${shift}`
  })
  return [
    '# User calendar',
    '',
    `- The user's current time zone: ${zone} (${today.offset}). Read every date or time the user gives without a zone in this zone, and show every time converted to it. Never mention time zones to the user unless they ask. When another context says the browser time zone is unavailable, use this zone and do not ask.`,
    `- Today: ${today.iso} ${today.weekday}.`,
    `- The next ${CALENDAR_DAYS} days: ${upcoming.join(', ')}.`,
    `- The /ddl week: ${weekLabel(now, zone)}.`,
  ].join('\n')
}
