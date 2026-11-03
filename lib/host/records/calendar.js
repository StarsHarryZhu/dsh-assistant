/**
 * Edits of `ddl.md` behind the calendar tools: local dates and times come in,
 * UTC lines go out, and the file is pruned on every write. Pure: text in, text
 * out. The line formats are ddl.ts's.
 * @module dsh-assisstant/host/records/calendar
 */
import { describeEntry, isAllDay, local, parseDdl, repeatsOn, ruleText, zonedToUtc } from "../ddl.js";
import { insertInSection, joinLines, linesOf, matching, oneLine } from "./text.js";
export const CALENDAR_FILE = 'ddl.md';
const REPEATS_HEADING = '## 重复';
const OPEN_HEADING = '## 待完成';
const DONE_HEADING = '## 已完成';
const TEMPLATE = `# DDL 与行程

> 助理维护。每行是一项 DDL、日程或项目截止，时间是 UTC；「重复」里的时间是家人当地的时间。时间过去的事件自动删除；无日期事件完成 7 天后删除。

${REPEATS_HEADING}

${OPEN_HEADING}

${DONE_HEADING}
`;
/** How long an undated done item stays, in milliseconds. */
const DONE_KEEP_MS = 7 * 86_400_000;
/** How many candidates a miss or an ambiguous match lists. */
const MAX_CANDIDATES = 10;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;
const DONE_AT = /（完成 (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z)）\s*$/u;
/** @returns "YYYY-MM-DDTHH:MMZ". */
function utc(ms) {
    return `${new Date(ms).toISOString().slice(0, 16)}Z`;
}
/** @returns whether the text is a real calendar date. */
function validDate(text) {
    if (!DATE.test(text))
        return false;
    const [year, month, day] = text.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
/** @returns the date that many days later. */
function addDays(date, days) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
/** @returns the days from one date to another. */
function daysBetween(from, to) {
    return Math.round((Date.parse(`${to}T00:00Z`) - Date.parse(`${from}T00:00Z`)) / 86_400_000);
}
/** @returns the first thing wrong with the given dates and times, if any. */
export function invalidTiming(item) {
    for (const date of [item.date, item.endDate]) {
        if (date !== undefined && !validDate(date))
            return `The date "${date}" is wrong; write it as YYYY-MM-DD.`;
    }
    for (const time of [item.time, item.endTime]) {
        if (time !== undefined && !TIME.test(time))
            return `The time "${time}" is wrong; write it as 24-hour HH:MM.`;
    }
    return undefined;
}
/**
 * The stored times of a one-off item. A DDL with a date but no time is due
 * 23:59; a 日程 with a date but no time is all day; an end date alone ends 23:59.
 */
function timesOf(item, zone) {
    if (item.date === undefined)
        return {};
    const start = zonedToUtc(item.date, item.time ?? (item.kind === '日程' ? '00:00' : '23:59'), zone);
    const endDate = item.endDate ?? (item.endTime !== undefined ? item.date : undefined);
    if (endDate !== undefined)
        return { start, end: zonedToUtc(endDate, item.endTime ?? '23:59', zone) };
    if (item.time === undefined && item.kind === '日程')
        return { start, end: zonedToUtc(item.date, '23:59', zone) };
    return { start };
}
/** @returns the repeat of an item, or why it has none it can use. */
function repeatOf(item) {
    const time = item.time === undefined ? {} : { time: item.time };
    if (item.repeat === 'daily')
        return { rule: { kind: 'daily' }, ...time };
    if (item.repeat === 'weekly' && item.weekdays !== undefined && item.weekdays.length > 0) {
        if (item.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7))
            return 'weekdays take 1 (Monday) to 7 (Sunday).';
        return { rule: { kind: 'weekly', weekdays: [...new Set(item.weekdays)].sort((a, b) => a - b) }, ...time };
    }
    if (item.date === undefined)
        return 'A repeating item needs a date, which fixes its weekday or day of the month (daily items excepted).';
    const [year, month, day] = item.date.split('-').map(Number);
    if (item.repeat === 'weekly')
        return { rule: { kind: 'weekly', weekdays: [new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7] }, ...time };
    if (item.repeat === 'monthly')
        return { rule: { kind: 'monthly', day }, ...time };
    return { rule: { kind: 'yearly', month, day }, ...time };
}
/** @returns the item's title with its note. */
function fullTitle(title, note) {
    const cleaned = note === undefined ? '' : oneLine(note);
    return cleaned === '' ? oneLine(title) : `${oneLine(title)}（${cleaned}）`;
}
/** @returns the entry's line in the file. */
function lineOf(entry, doneAt) {
    if (entry.repeat !== undefined) {
        return `- ${ruleText(entry.repeat.rule)}${entry.repeat.time === undefined ? '' : ` ${entry.repeat.time}`} · ${entry.kind} · ${entry.title}`;
    }
    const when = entry.start === undefined ? '无日期' : entry.end === undefined ? utc(entry.start) : `${utc(entry.start)} – ${utc(entry.end)}`;
    return `- [${entry.done ? 'x' : ' '}] ${when} · ${entry.kind} · ${entry.title}${doneAt === undefined ? '' : `（完成 ${utc(doneAt)}）`}`;
}
/** @returns whether an existing line sorts after an item starting at that instant. */
function sortsAfter(line, start) {
    if (start === undefined)
        return false;
    const entry = parseDdl(line)[0];
    return entry !== undefined && (entry.start === undefined || entry.start > start);
}
/** Remove past dated items and undated items done over a week ago. */
function prune(lines, now) {
    return lines.filter((line) => {
        const entry = parseDdl(line)[0];
        if (entry === undefined || entry.repeat !== undefined)
            return true;
        if (entry.start !== undefined)
            return (entry.end ?? entry.start) >= now;
        if (!entry.done)
            return true;
        const doneAt = DONE_AT.exec(line)?.[1];
        return doneAt === undefined || Date.parse(doneAt) + DONE_KEEP_MS >= now;
    });
}
/** Put the entry in its section, adding the section where an older file lacks it. */
function place(lines, entry, doneAt) {
    if (entry.repeat !== undefined) {
        if (!lines.some(line => line.trim() === REPEATS_HEADING)) {
            // An older file has no such section: it goes above the open items.
            const open = lines.findIndex(line => line.trim() === OPEN_HEADING);
            if (open >= 0)
                lines.splice(open, 0, REPEATS_HEADING, '');
        }
        insertInSection(lines, REPEATS_HEADING, lineOf(entry));
        return;
    }
    const heading = entry.done ? DONE_HEADING : OPEN_HEADING;
    if (!entry.done && !lines.some(line => line.trim() === OPEN_HEADING)) {
        const done = lines.findIndex(line => line.trim() === DONE_HEADING);
        if (done >= 0)
            lines.splice(done, 0, OPEN_HEADING, '');
    }
    insertInSection(lines, heading, lineOf(entry, doneAt), line => sortsAfter(line, entry.start));
}
/**
 * Add an item.
 * @param text - the file, undefined when absent.
 * @param item - the new item.
 * @param now - the current instant.
 * @param zone - the family member's IANA zone.
 * @returns the outcome.
 */
export function addItem(text, item, now, zone) {
    const invalid = invalidTiming(item);
    if (invalid !== undefined)
        return { ok: false, message: invalid };
    const title = fullTitle(item.title, item.note);
    if (title === '')
        return { ok: false, message: 'The title is empty.' };
    let entry;
    if (item.repeat !== undefined) {
        const repeat = repeatOf(item);
        if (typeof repeat === 'string')
            return { ok: false, message: repeat };
        entry = { done: false, repeat, kind: item.kind, title };
    }
    else {
        if (item.date === undefined && (item.time !== undefined || item.endDate !== undefined || item.endTime !== undefined)) {
            return { ok: false, message: 'A time needs a date too. An item with no date takes no time.' };
        }
        const times = timesOf(item, zone);
        if (times.start !== undefined && (times.end ?? times.start) < now) {
            return { ok: false, message: `${item.date} ${item.time ?? ''} has already passed, so nothing was recorded. Check the date and the year.` };
        }
        if (times.start !== undefined && times.end !== undefined && times.end < times.start)
            return { ok: false, message: 'The end is before the start.' };
        entry = { done: false, ...times, kind: item.kind, title };
    }
    const lines = linesOf(text ?? TEMPLATE);
    place(lines, entry);
    return { ok: true, text: joinLines(prune(lines, now)), entry };
}
/** @returns whether the entry falls on a local date. */
function fallsOn(entry, date, zone) {
    if (entry.repeat !== undefined)
        return repeatsOn(entry.repeat.rule, date);
    if (entry.start === undefined)
        return false;
    return local(entry.start, zone).iso <= date && date <= local(entry.end ?? entry.start, zone).iso;
}
/** @returns the entry's times after a change of date or time. */
function movedTimes(entry, edit, zone) {
    const changesTime = edit.date !== undefined || edit.time !== undefined || edit.endDate !== undefined || edit.endTime !== undefined;
    if (!changesTime)
        return { ...(entry.start === undefined ? {} : { start: entry.start }), ...(entry.end === undefined ? {} : { end: entry.end }) };
    if (entry.start === undefined && edit.date === undefined)
        return 'This item has no date yet; changing its time needs a date too.';
    const kind = edit.kind ?? entry.kind;
    const old = entry.start === undefined ? undefined : local(entry.start, zone);
    const wholeDay = isAllDay(entry, zone);
    const dueOnly = kind !== '日程' && old?.time === '23:59';
    const date = edit.date ?? old.iso;
    const time = edit.time ?? (wholeDay || dueOnly ? undefined : old?.time);
    const item = { title: entry.title, kind, date, time, endDate: edit.endDate, endTime: edit.endTime };
    if (edit.endDate !== undefined || edit.endTime !== undefined || entry.end === undefined)
        return timesOf(item, zone);
    // A span keeps its length: a timed one exactly, a whole-day one in days.
    if (!wholeDay) {
        const start = zonedToUtc(date, time, zone);
        return { start, end: start + entry.end - entry.start };
    }
    if (edit.time !== undefined)
        return timesOf(item, zone);
    return timesOf({ ...item, endDate: addDays(date, daysBetween(old.iso, local(entry.end, zone).iso)) }, zone);
}
/**
 * Change, finish, reopen, or remove an item found by its title.
 * @param text - the file, undefined when absent.
 * @param edit - which item and what to do.
 * @param now - the current instant.
 * @param zone - the family member's IANA zone.
 * @returns the outcome.
 */
export function updateItem(text, edit, now, zone) {
    const invalid = invalidTiming(edit);
    if (invalid !== undefined)
        return { ok: false, message: invalid };
    if (edit.on !== undefined && !validDate(edit.on))
        return { ok: false, message: `The date "${edit.on}" is wrong; write it as YYYY-MM-DD.` };
    const lines = linesOf(text ?? TEMPLATE);
    const wanted = edit.action === 'reopen';
    const all = lines.flatMap((line, index) => {
        const entry = parseDdl(line)[0];
        return entry === undefined || entry.done !== wanted ? [] : [{ index, entry }];
    });
    const found = matching(all, edit.match, item => item.entry.title).filter(item => edit.on === undefined || fallsOn(item.entry, edit.on, zone));
    if (found.length === 0) {
        const open = all.slice(0, MAX_CANDIDATES).map(item => `- ${describeEntry(item.entry, zone)}`);
        return { ok: false, message: [`Nothing matches "${edit.match}".`, ...(open.length === 0 ? ['The schedule has nothing to change.'] : ['What is there:', ...open])].join('\n') };
    }
    if (found.length > 1) {
        const listed = found.slice(0, MAX_CANDIDATES).map(item => `- ${describeEntry(item.entry, zone)}`);
        return { ok: false, message: [`"${edit.match}" matches ${found.length} items; give the full title or on (that day's date):`, ...listed].join('\n') };
    }
    const { index, entry } = found[0];
    lines.splice(index, 1);
    let next;
    let doneAt;
    if (edit.action === 'done') {
        if (entry.repeat !== undefined)
            return { ok: false, message: 'A repeating item is not ticked off each time. To note that it was done this time, use log_add; when it is no longer needed, use remove.' };
        next = { ...entry, done: true };
        doneAt = now;
    }
    else if (edit.action === 'reopen') {
        next = { ...entry, done: false };
    }
    else if (edit.action === 'change') {
        const changed = changedEntry(entry, edit, now, zone);
        if (typeof changed === 'string')
            return { ok: false, message: changed };
        next = changed;
    }
    if (next !== undefined)
        place(lines, next, doneAt);
    return { ok: true, text: joinLines(prune(lines, now)), ...(next === undefined ? {} : { entry: next }), previous: entry };
}
/** @returns the entry after a `change`, or why it cannot change that way. */
function changedEntry(entry, edit, now, zone) {
    const kind = edit.kind ?? entry.kind;
    const title = edit.title === undefined && edit.note === undefined
        ? entry.title
        : fullTitle(edit.title ?? entry.title.replace(/（[^）]*）$/u, ''), edit.note ?? /（([^）]*)）$/u.exec(entry.title)?.[1]);
    if (title === '')
        return 'The title is empty.';
    if (entry.repeat !== undefined) {
        if (edit.repeat === undefined && edit.date === undefined && edit.weekdays === undefined) {
            const time = edit.time ?? entry.repeat.time;
            return { done: false, repeat: { rule: entry.repeat.rule, ...(time === undefined ? {} : { time }) }, kind, title };
        }
        const repeat = repeatOf({
            title,
            kind,
            time: edit.time ?? entry.repeat.time,
            date: edit.date,
            repeat: edit.repeat ?? entry.repeat.rule.kind,
            weekdays: edit.weekdays,
        });
        return typeof repeat === 'string' ? repeat : { done: false, repeat, kind, title };
    }
    if (edit.repeat !== undefined)
        return 'A one-off item cannot become a repeating one directly: remove it, then add it again with calendar_add.';
    const times = movedTimes(entry, edit, zone);
    if (typeof times === 'string')
        return times;
    if (times.start !== undefined && (times.end ?? times.start) < now)
        return 'The new time has already passed, so nothing changed. Check the date and the year.';
    if (times.start !== undefined && times.end !== undefined && times.end < times.start)
        return 'The end is before the start.';
    return { done: entry.done, ...times, kind, title };
}
/**
 * @param entry - an entry.
 * @param zone - the family member's IANA zone.
 * @returns whether it has a clock time a reminder can lead: not all day, and
 * not a date-only deadline stored as 23:59.
 */
export function hasClockTime(entry, zone) {
    if (entry.repeat !== undefined)
        return entry.repeat.time !== undefined;
    if (entry.start === undefined || isAllDay(entry, zone))
        return false;
    return entry.kind === '日程' || local(entry.start, zone).time !== '23:59';
}
