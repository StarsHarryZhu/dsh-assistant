/**
 * Time in the user's own zone (recorded in the profile, never read from a
 * browser): the zone primitives every host module shares (an instant's local
 * date and time, a local time's instant, date arithmetic, the `HH:MM` shape),
 * the calendar the model reads every assembly, the clock it gets every few
 * minutes, and the `/ddl` week window. Ported from assistant-mode
 * (`my_plugins/dsh-assisstant/lib/index.js`).
 * @module dsh-assisstant/host/calendar
 */

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

/** @returns the host process time zone: only a stand-in until the user's zone is recorded. */
export function processZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** A 24-hour clock time, `HH:MM`. */
export const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/u

/** One instant in a zone. */
export interface LocalTime {
  /** "YYYY-MM-DD". */
  readonly iso: string
  /** "MM/DD". */
  readonly short: string
  /** "HH:MM", 24-hour. */
  readonly time: string
}

/**
 * One formatter per zone: building one costs several times a format, and the
 * week view, the heartbeat, and every reminder ask for the same few zones.
 */
const formatters = new Map<string, Intl.DateTimeFormat>()

/** @returns the zone's date and time parts at that instant, as numbers in text. */
function partsAt(ms: number, zone: string): Record<string, string> {
  let formatter = formatters.get(zone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
    formatters.set(zone, formatter)
  }
  return Object.fromEntries(formatter.formatToParts(new Date(ms)).map(part => [part.type, part.value]))
}

/** @returns the zone's date and 24-hour time at that instant. */
export function local(ms: number, zone: string): LocalTime {
  const parts = partsAt(ms, zone)
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, short: `${parts.month}/${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

/** @returns the zone's offset from UTC at that instant, in milliseconds. */
function offsetMs(ms: number, zone: string): number {
  const parts = partsAt(ms, zone)
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
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
  const before = wall - offsetMs(wall - 86_400_000, zone)
  const after = wall - offsetMs(wall + 86_400_000, zone)
  const valid = [before, after].filter((candidate) => {
    const seen = local(candidate, zone)
    return seen.iso === date && seen.time === time
  })
  return valid.length === 0 ? before : Math.min(...valid)
}

/** @returns the calendar date that many days away from "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
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
  const today = local(now.getTime(), zone).iso
  return Array.from({ length: count + 1 }, (_, index) => {
    const iso = addDays(today, index)
    return { iso, short: `${iso.slice(5, 7)}/${iso.slice(8, 10)}`, weekday: weekdayOf(iso), offset: offsetAt(new Date(`${iso}T12:00Z`), zone) }
  })
}

/**
 * The clock reading the model gets, in place of the host's own, which only knows
 * the browser's and the device's zones.
 * @param now - the current instant.
 * @param zone - the user's current IANA zone.
 * @returns one line.
 */
export function clockText(now: Date, zone: string): string {
  const { iso, time } = local(now.getTime(), zone)
  return `Current time: ${iso} ${weekdayOf(iso)} ${time} (${zone}, ${offsetAt(now, zone)}).`
}

/** @returns the Chinese weekday of a calendar date, "YYYY-MM-DD". */
export function weekdayOf(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number]
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] as string
}

/** @returns an instant in the zone as "11/05 周四 14:30". */
export function whenText(ms: number, zone: string): string {
  const at = local(ms, zone)
  return `${at.short} ${weekdayOf(at.iso)} ${at.time}`
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
    `- The user's current time zone: ${zone} (${today.offset}). Read every date or time the user gives without a zone in this zone, and show every time converted to it. Never mention time zones to the user unless they ask.`,
    `- Today: ${today.iso} ${today.weekday}.`,
    `- The next ${CALENDAR_DAYS} days: ${upcoming.join(', ')}.`,
    `- The /ddl week: ${weekLabel(now, zone)}.`,
  ].join('\n')
}
