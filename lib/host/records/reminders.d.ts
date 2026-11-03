/**
 * Keeps the host's reminders in step with the calendar. A timed item gets a
 * reminder its lead time before it; changing, finishing, or removing the item
 * changes or removes the reminder. Nothing links the two but the reminder's
 * title and its prompt's prefix, so no second table can drift from the file.
 * Reminders always live on the assistant conversation: the host refuses to arm
 * them on a worker's session.
 * @module dsh-assisstant/host/records/reminders
 */
import type { DdlEntry } from '../ddl.ts';
import type { ScheduleLike } from '../types.ts';
/** What the reminder calls need. */
export interface ReminderContext {
    readonly schedule: ScheduleLike | undefined;
    /** The assistant conversation. */
    readonly sessionId: string;
    readonly zone: string;
    readonly leadMinutes: number;
    readonly now: number;
}
/**
 * Remove an entry's reminder, if it has one.
 * @param context - the conversation and settings.
 * @param entry - the entry as it was.
 */
export declare function dropReminder(context: ReminderContext, entry: DdlEntry): Promise<void>;
/**
 * Arm an entry's reminder.
 * @param context - the conversation and settings.
 * @param entry - the entry as it is now.
 * @returns a sentence for the tool result, or an empty string when the entry takes no reminder.
 */
export declare function armReminder(context: ReminderContext, entry: DdlEntry): Promise<string>;
