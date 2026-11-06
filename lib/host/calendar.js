/**
 * The calendar the model reads every assembly, the clock it gets every few
 * minutes, and the `/ddl` week window, all in the user's own time zone (recorded
 * in the profile, never read from a browser). Ported from assistant-mode
 * (`my_plugins/dsh-assisstant/lib/index.js`).
 * @module dsh-assisstant/host/calendar
 */
/** How many days after today the calendar context lists. */
const CALENDAR_DAYS = 14;
/** How many days after today the /ddl window covers (today plus six). */
const WEEK_DAYS = 6;
/** Chinese weekday names indexed by `Date#getUTCDay()`. */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/**
 * @param value - a candidate IANA zone name.
 * @returns the name when the runtime accepts it unchanged, else undefined.
 */
export function validZone(value) {
    if (typeof value !== 'string' || value.length === 0)
        return undefined;
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone === value ? value : undefined;
    }
    catch {
        return undefined;
    }
}
/** @returns the host process time zone: only a stand-in until the user's zone is recorded. */
export function processZone() {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}
/** @returns the zone's calendar date at that instant. */
function localDate(date, zone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(date).map(part => [part.type, part.value]));
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}
/** @returns the zone's UTC offset at that instant, as "UTC-04:00". */
function offsetAt(date, zone) {
    const label = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
        .formatToParts(date).find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
    return label === 'GMT' ? 'UTC+00:00' : label.replace('GMT', 'UTC');
}
/**
 * The zone's local days from today on. Each day is anchored at UTC noon of
 * that calendar date, so the date arithmetic never depends on the zone.
 * @param now - the current instant.
 * @param zone - an IANA zone.
 * @param count - days after today to include.
 * @returns today and the following days.
 */
export function localDays(now, zone, count) {
    const today = localDate(now, zone);
    const pad = (n) => String(n).padStart(2, '0');
    return Array.from({ length: count + 1 }, (_, index) => {
        const noon = new Date(Date.UTC(today.year, today.month - 1, today.day + index, 12));
        return {
            iso: `${noon.getUTCFullYear()}-${pad(noon.getUTCMonth() + 1)}-${pad(noon.getUTCDate())}`,
            short: `${pad(noon.getUTCMonth() + 1)}/${pad(noon.getUTCDate())}`,
            weekday: WEEKDAYS[noon.getUTCDay()],
            offset: offsetAt(noon, zone),
        };
    });
}
/**
 * The clock reading the model gets, in place of the host's own, which only knows
 * the browser's and the device's zones.
 * @param now - the current instant.
 * @param zone - the user's current IANA zone.
 * @returns one line.
 */
export function clockText(now, zone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(part => [part.type, part.value]));
    const today = localDays(now, zone, 0)[0];
    return `Current time: ${today.iso} ${today.weekday} ${parts.hour}:${parts.minute} (${zone}, ${offsetAt(now, zone)}).`;
}
/** @returns the Chinese weekday of a calendar date, "YYYY-MM-DD". */
export function weekdayOf(iso) {
    const [year, month, day] = iso.split('-').map(Number);
    return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}
/** @returns the /ddl window, as "10/26 周一 – 11/01 周日". */
export function weekLabel(now, zone) {
    const days = localDays(now, zone, WEEK_DAYS);
    const first = days[0];
    const last = days[days.length - 1];
    return `${first.short} ${first.weekday} – ${last.short} ${last.weekday}`;
}
/**
 * The calendar context. It changes only when the local date or the zone
 * changes, so it adds no snapshot per step.
 * @param now - the current instant.
 * @param zone - the user's current IANA zone.
 * @returns the context text.
 */
export function calendarText(now, zone) {
    const days = localDays(now, zone, CALENDAR_DAYS);
    const [today, ...rest] = days;
    const upcoming = rest.map((day, index) => {
        const before = index === 0 ? today : rest[index - 1];
        const shift = day.offset === before.offset ? '' : ` (${day.offset} from this day)`;
        return `${day.iso} ${day.weekday}${shift}`;
    });
    return [
        '# User calendar',
        '',
        `- The user's current time zone: ${zone} (${today.offset}). Read every date or time the user gives without a zone in this zone, and show every time converted to it. Never mention time zones to the user unless they ask.`,
        `- Today: ${today.iso} ${today.weekday}.`,
        `- The next ${CALENDAR_DAYS} days: ${upcoming.join(', ')}.`,
        `- The /ddl week: ${weekLabel(now, zone)}.`,
    ].join('\n');
}
