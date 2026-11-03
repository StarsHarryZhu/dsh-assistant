/**
 * Keeps the host's reminders in step with the calendar. A timed item gets a
 * reminder its lead time before it; changing, finishing, or removing the item
 * changes or removes the reminder. Nothing links the two but the reminder's
 * title and its prompt's prefix, so no second table can drift from the file.
 * Reminders always live on the assistant conversation: the host refuses to arm
 * them on a worker's session.
 * @module dsh-assisstant/host/records/reminders
 */
import { describeEntry, ruleText } from "../ddl.js";
import { hasClockTime } from "./calendar.js";
/** Starts the prompt of every reminder this module arms; a reminder the model set by hand never does. */
const PROMPT_PREFIX = '日程提醒：';
/** The longest title the host accepts. */
const MAX_TITLE_CHARS = 120;
/** @returns the reminder's title for an entry. */
function titleOf(entry) {
    return entry.title.slice(0, MAX_TITLE_CHARS);
}
/** @returns the time a repeating reminder fires: the lead before the item, not before midnight of its day. */
function ledClock(time, leadMinutes) {
    const [hour, minute] = time.split(':').map(Number);
    const minutes = Math.max(0, hour * 60 + minute - leadMinutes);
    return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
}
/** @returns the reminder of a one-off entry: at its target if one is there, else the only one with that title. */
function reminderOf(records, entry, leadMinutes) {
    const ours = records.filter(record => record.title === titleOf(entry) && record.prompt.startsWith(PROMPT_PREFIX));
    if (entry.repeat !== undefined)
        return ours.filter(record => record.kind !== 'at');
    const oneOff = ours.filter(record => record.kind === 'at');
    if (entry.start === undefined)
        return oneOff;
    const target = entry.start - leadMinutes * 60_000;
    const exact = oneOff.filter(record => Date.parse(record.scheduledAt) === target);
    return exact.length > 0 ? exact : oneOff.length === 1 ? oneOff : [];
}
/**
 * Remove an entry's reminder, if it has one.
 * @param context - the conversation and settings.
 * @param entry - the entry as it was.
 */
export async function dropReminder(context, entry) {
    const { schedule, sessionId } = context;
    if (schedule === undefined)
        return;
    const records = await schedule.list({ sessionId });
    for (const record of reminderOf(records, entry, context.leadMinutes))
        await schedule.delete({ sessionId, id: record.id });
}
/**
 * Arm an entry's reminder.
 * @param context - the conversation and settings.
 * @param entry - the entry as it is now.
 * @returns a sentence for the tool result, or an empty string when the entry takes no reminder.
 */
export async function armReminder(context, entry) {
    const { schedule, sessionId, zone, leadMinutes, now } = context;
    if (!hasClockTime(entry, zone))
        return '';
    if (schedule === undefined)
        return 'Reminders are unavailable right now, so this item has no reminder.';
    const prompt = `${PROMPT_PREFIX}${describeEntry(entry, zone)}。用一句温和的话提醒家人。`;
    const title = titleOf(entry);
    if (entry.repeat !== undefined) {
        const { rule, time } = entry.repeat;
        const { hour, minute } = ledClock(time, leadMinutes);
        const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        const seconds = `${clock}:00`;
        const selector = rule.kind === 'daily'
            ? { daily: { time: seconds, time_zone: zone } }
            : rule.kind === 'weekly'
                ? { weekly: { time: seconds, time_zone: zone, weekdays: [...rule.weekdays] } }
                : { cron: { expression: `${minute} ${hour} ${rule.day} ${rule.kind === 'yearly' ? rule.month : '*'} *`, time_zone: zone } };
        await schedule.create(sessionId, { prompt, title, ...selector });
        return `Reminder set: ${ruleText(rule)} ${clock}.`;
    }
    const target = entry.start - leadMinutes * 60_000;
    if (target <= now)
        return `It is less than ${leadMinutes} minutes away, so no reminder was set.`;
    await schedule.create(sessionId, { prompt, title, at: new Date(target).toISOString() });
    return `Reminder set: ${leadMinutes} minutes before.`;
}
