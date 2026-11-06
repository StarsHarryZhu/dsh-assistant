/**
 * The record tools: quick reads and writes of fixed files in one user's
 * workspace, in the same turn and without a worker. They register in
 * the two hidden presets' scope only, so no other session ever sees them.
 * Results are plain text for the model; a failure is a normal result it can act on.
 * @module dsh-assisstant/host/records/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { describeEntry, local } from "../ddl.js";
import { recordToolTitle } from "../../shared/record-tools.js";
import { validZone } from "../calendar.js";
import { quietSpanAt, remindAt } from "../quiet.js";
import { CALENDAR_FILE, addItem, hasClockTime, invalidTiming, isMuted, updateItem } from "./calendar.js";
import { LISTS_FOLDER, editList, readList } from "./lists.js";
import { LOGS_FOLDER, addLogEntry } from "./logs.js";
import { MAX_KEY_CHARS, MAX_VALUE_CHARS, MEMO_FILE, setMemo } from "./memos.js";
import { PERSONA_FIELDS, PERSONA_FILE, setPersonaField } from "./persona.js";
import { PROFILE_FIELDS, PROFILE_FILE, ZONE_FIELD, setProfileField } from "./profile.js";
import { PROJECTS_FOLDER, editProject } from "./projects.js";
import { RECALL_KINDS, recall } from "./recall.js";
import { namedFile } from "./store.js";
/** Tools only the assistant conversation has: what it knows about them, and how it talks. */
export const ROUTER_ONLY_TOOLS = ['profile_set', 'persona_set'];
const OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        ok: { type: 'boolean', required: true },
        message: { type: 'string', required: true },
    },
};
const OUTPUT = {
    schema: OUTPUT_SCHEMA,
    render: (_args, value) => [{ type: 'text', text: value.message }],
};
const DATE_HINT = 'YYYY-MM-DD, their local date';
const TIME_HINT = 'HH:MM, 24-hour, their local time';
const KIND = {
    type: 'string',
    enum: ['DDL', '日程', '项目'],
    description: 'DDL: to finish or hand in by a time. 日程: happens at a time. 项目: a project\'s due date. When nothing points either way, DDL.',
};
const WEEKDAYS = {
    type: 'array',
    items: { type: 'integer' },
    description: 'For weekly: the days, 1 (Monday) to 7 (Sunday). Omit to use the weekday of `date`.',
};
const REPEAT_NAMES = ['daily', 'weekly', 'monthly', 'yearly'];
const TIME_ZONE = {
    type: 'string',
    description: 'An IANA zone such as Asia/Tokyo, only when the date and time given are in another zone than theirs now (a meeting where they will be travelling). A repeat ignores it.',
};
/** @returns a pending-call card with a plain title; the user reads it in the conversation. */
function card(title, kind = 'other') {
    return { card: 'generic', title, kind };
}
/** @returns the sentences joined, leaving out empty ones. */
function sentences(...parts) {
    return parts.filter(part => part !== '').join(' ');
}
/**
 * What the reminder of an item will be, for a tool's result: the heartbeat gives
 * it by reading the file, so nothing is set up here.
 * @param entry - the item as stored.
 * @param target - the assistant's zone and settings.
 * @param now - the current instant.
 * @returns a sentence, or an empty string when the item takes no reminder.
 */
export function reminderSentence(entry, target, now) {
    const { zone, assistant } = target;
    if (isMuted(entry) || !hasClockTime(entry, zone))
        return '';
    const lead = assistant.reminderLeadMinutes;
    if (entry.repeat !== undefined)
        return `A reminder will come ${lead} minutes before each time; one that falls in quiet hours comes before or after them instead.`;
    const event = entry.start;
    const at = remindAt(assistant, event, lead, zone);
    if (at <= now) {
        return quietSpanAt(assistant, now, zone) !== undefined
            ? 'No reminder will come: it falls in quiet hours, and it is too late to move the reminder before them. If they want waking for it, use wake_after with through_quiet.'
            : `It is less than ${lead} minutes away, so no reminder will come.`;
    }
    const when = local(at, zone);
    return at === event - lead * 60_000
        ? `A reminder will come ${lead} minutes before, at ${when.time}.`
        : `Its reminder would fall in quiet hours, so it will come at ${when.short} ${when.time} instead.`;
}
/**
 * Build the tools a role has.
 * @param role - `router` has all nine; `worker` has all but the profile and persona.
 * @param deps - the target, settings, and reminder service.
 * @returns tool definitions to register in the preset's scope.
 */
export function recordTools(role, deps) {
    const run = async (exec, body) => {
        const target = deps.target(exec.agent);
        if (target === undefined)
            return { ok: false, message: 'This user has no workspace, so nothing was recorded.' };
        try {
            return await body(target, Date.now());
        }
        catch (error) {
            return { ok: false, message: `It did not work: ${String(error)}` };
        }
    };
    /** @returns the zone a call's times are in, or why its `time_zone` cannot be used. */
    const callZone = (target, given) => {
        if (given === undefined || given.trim() === '')
            return target.zone;
        return validZone(given.trim()) ?? { message: `"${given}" is not a time zone: use an IANA name such as Asia/Tokyo.` };
    };
    const shared = [
        defineTool({
            name: 'calendar_add',
            description: 'Record one thing with a time: a deadline, an appointment, or something that repeats; it may also have no date. '
                + 'The host converts the time, and anything with a clock time gets its reminder by itself.',
            parameters: {
                title: { type: 'string', required: true, description: 'Short, in their words. No dates or times in it.' },
                kind: { ...KIND, required: true },
                date: { type: 'string', description: `The date, ${DATE_HINT}. Omit when there is none. For a repeat: any date that falls on it.` },
                time: { type: 'string', description: `${TIME_HINT}. Omit when no time was given.` },
                end_date: { type: 'string', description: 'Last day of something spanning days.' },
                end_time: { type: 'string', description: 'When it ends.' },
                repeat: { type: 'string', enum: REPEAT_NAMES, description: 'How it repeats: every day, week, month, or year.' },
                weekdays: WEEKDAYS,
                note: { type: 'string', description: 'A short remark in their words.' },
                remind: { type: 'boolean', description: 'false when they said not to be reminded.' },
                time_zone: TIME_ZONE,
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('calendar_add', args)),
            execute: (args, exec) => run(exec, (target, now) => {
                const zone = callZone(target, args.time_zone);
                if (typeof zone !== 'string')
                    return { ok: false, message: zone.message };
                const result = addItem(target.store.read(CALENDAR_FILE), {
                    title: args.title,
                    kind: args.kind,
                    note: args.note,
                    date: args.date,
                    time: args.time,
                    endDate: args.end_date,
                    endTime: args.end_time,
                    repeat: args.repeat,
                    weekdays: args.weekdays,
                    muted: args.remind === false,
                }, now, zone);
                if (!result.ok)
                    return { ok: false, message: result.message };
                target.store.write(CALENDAR_FILE, result.text);
                const entry = result.entry;
                return { ok: true, message: sentences(`Recorded: ${describeEntry(entry, target.zone)}.`, reminderSentence(entry, target, now)) };
            }),
        }),
        defineTool({
            name: 'calendar_update',
            description: 'Change, finish, reopen, or remove one recorded item, found by its title. Its reminder follows by itself. '
                + 'When several items match, the result lists them: call again with the full title or `on`.',
            parameters: {
                match: { type: 'string', required: true, description: 'The item\'s title, or part of it.' },
                action: {
                    type: 'string',
                    required: true,
                    enum: ['change', 'done', 'reopen', 'remove'],
                    description: 'change: new title or time, given below. done: it is finished. reopen: it was marked done by mistake. remove: cancelled, or no longer wanted.',
                },
                on: { type: 'string', description: `A date the item falls on, ${DATE_HINT}, to tell same-named items apart.` },
                title: { type: 'string', description: 'change: the new title.' },
                kind: KIND,
                date: { type: 'string', description: `change: the new date, ${DATE_HINT}. A timed item keeps its time.` },
                time: { type: 'string', description: `change: the new time, ${TIME_HINT}. It keeps its date.` },
                end_date: { type: 'string', description: 'change: the new last day.' },
                end_time: { type: 'string', description: 'change: the new end time.' },
                repeat: { type: 'string', enum: REPEAT_NAMES, description: 'change, on a repeating item: the new repeat, with `date` or `weekdays`.' },
                weekdays: WEEKDAYS,
                note: { type: 'string', description: 'change: the new remark.' },
                remind: { type: 'boolean', description: 'change: false when they said not to be reminded, true when they want reminders again.' },
                time_zone: TIME_ZONE,
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('calendar_update', args)),
            execute: (args, exec) => run(exec, (target, now) => {
                const action = args.action;
                const zone = callZone(target, args.time_zone);
                if (typeof zone !== 'string')
                    return { ok: false, message: zone.message };
                const result = updateItem(target.store.read(CALENDAR_FILE), {
                    match: args.match,
                    on: args.on,
                    action,
                    title: args.title,
                    kind: args.kind,
                    note: args.note,
                    date: args.date,
                    time: args.time,
                    endDate: args.end_date,
                    endTime: args.end_time,
                    repeat: args.repeat,
                    weekdays: args.weekdays,
                    muted: args.remind === undefined ? undefined : !args.remind,
                }, now, zone);
                if (!result.ok)
                    return { ok: false, message: result.message };
                target.store.write(CALENDAR_FILE, result.text);
                const previous = result.previous;
                const entry = result.entry;
                const reminder = entry === undefined || entry.done ? '' : reminderSentence(entry, target, now);
                const verb = { change: 'Changed to', done: 'Done', reopen: 'Reopened', remove: 'Cancelled' }[action];
                return { ok: true, message: sentences(`${verb}: ${describeEntry(entry ?? previous, target.zone)}.`, reminder) };
            }),
        }),
        defineTool({
            name: 'list_update',
            description: 'Add to, tick off, or clean up a named list of like things: 买菜, 要带的东西, 想看的电影. The list is created when new.',
            parameters: {
                list: { type: 'string', required: true, description: 'The list\'s short name.' },
                add: { type: 'array', items: { type: 'string' }, description: 'Items to add.' },
                check: { type: 'array', items: { type: 'string' }, description: 'Items that are done.' },
                uncheck: { type: 'array', items: { type: 'string' }, description: 'Items ticked by mistake.' },
                remove: { type: 'array', items: { type: 'string' }, description: 'Items to take off the list.' },
                delete_list: { type: 'boolean', description: 'true deletes the whole list, when they no longer want it.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('list_update', args)),
            execute: (args, exec) => run(exec, (target, now) => {
                if (args.list.trim() === '')
                    return { ok: false, message: 'A list needs a name.' };
                const path = namedFile(LISTS_FOLDER, args.list);
                if (args.delete_list === true) {
                    target.store.remove(path);
                    return { ok: true, message: `List "${args.list}" deleted.` };
                }
                const { text, missing } = editList(target.store.read(path), args.list.trim(), args, local(now, target.zone).iso);
                target.store.write(path, text);
                const { open } = readList(text);
                return {
                    ok: true,
                    message: sentences(`List "${args.list}" has ${open.length} open${open.length === 0 ? '' : `: ${open.join(', ')}`}.`, missing.length === 0 ? '' : `Not found: ${missing.join(', ')}.`),
                };
            }),
        }),
        defineTool({
            name: 'memo_set',
            description: 'Remember one fact to look up later, a new value replacing the old: 钥匙放哪, 王阿姨电话, 孩子鞋码, 医生嘱咐. An empty value deletes it.',
            parameters: {
                key: { type: 'string', required: true, description: 'A short name for the fact.' },
                value: { type: 'string', required: true, description: 'The fact in their words; empty deletes it.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('memo_set', args)),
            execute: (args, exec) => run(exec, (target, now) => {
                if (args.key.trim() === '' || args.key.length > MAX_KEY_CHARS)
                    return { ok: false, message: `A memo needs a name of at most ${MAX_KEY_CHARS} characters.` };
                if (args.value.length > MAX_VALUE_CHARS)
                    return { ok: false, message: `A memo holds at most ${MAX_VALUE_CHARS} characters. Hand longer content to a worker to save as a file.` };
                const { text, outcome } = setMemo(target.store.read(MEMO_FILE), args.key, args.value, local(now, target.zone).iso);
                if (outcome === 'missing')
                    return { ok: false, message: `No memo is named "${args.key}".` };
                target.store.write(MEMO_FILE, text);
                return { ok: true, message: `${{ added: 'Recorded', replaced: 'Updated', deleted: 'Deleted' }[outcome]} memo "${args.key}".` };
            }),
        }),
        defineTool({
            name: 'log_add',
            description: 'Add a dated entry to a named log whose history matters: 血压, 体重, 记账, 吃药打卡. The current time is used unless given.',
            parameters: {
                log: { type: 'string', required: true, description: 'The log\'s short name.' },
                text: { type: 'string', required: true, description: 'The entry in their words.' },
                date: { type: 'string', description: `When it happened if not now, ${DATE_HINT}.` },
                time: { type: 'string', description: `${TIME_HINT}.` },
                replace_last: { type: 'boolean', description: 'true replaces the latest entry, when they correct it.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('log_add', args)),
            execute: (args, exec) => run(exec, (target, now) => {
                if (args.log.trim() === '' || args.text.trim() === '')
                    return { ok: false, message: 'A log entry needs a log name and some text.' };
                const invalid = invalidTiming({ date: args.date, time: args.time });
                if (invalid !== undefined)
                    return { ok: false, message: invalid };
                const current = local(now, target.zone);
                const at = `${args.date ?? current.iso} ${args.time ?? (args.date === undefined ? current.time : '12:00')}`;
                const path = namedFile(LOGS_FOLDER, args.log);
                target.store.write(path, addLogEntry(target.store.read(path), args.log.trim(), { at, text: args.text }, args.replace_last === true));
                return { ok: true, message: `Added to "${args.log}": ${at} ${args.text}.` };
            }),
        }),
        defineTool({
            name: 'project_update',
            description: 'Quick edits of a long-running matter\'s file: its goal and status, its to-dos, a dated note, all in English. Created when new. Planning and long documents go to a worker.',
            parameters: {
                project: { type: 'string', required: true, description: 'The project\'s short name.' },
                goal: { type: 'string', description: 'The new goal.' },
                status: { type: 'string', description: 'The new status.' },
                add_todo: { type: 'array', items: { type: 'string' }, description: 'To-dos to add.' },
                check_todo: { type: 'array', items: { type: 'string' }, description: 'To-dos that are done.' },
                note: { type: 'string', description: 'A note to add under today\'s date.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('project_update', args)),
            execute: (args, exec) => run(exec, (target, now) => {
                if (args.project.trim() === '')
                    return { ok: false, message: 'A project needs a name.' };
                const path = namedFile(PROJECTS_FOLDER, args.project);
                const { text, missing } = editProject(target.store.read(path), args.project.trim(), {
                    goal: args.goal,
                    status: args.status,
                    addTodo: args.add_todo,
                    checkTodo: args.check_todo,
                    note: args.note,
                }, local(now, target.zone).iso);
                target.store.write(path, text);
                return { ok: true, message: sentences(`Project "${args.project}" updated.`, missing.length === 0 ? '' : `To-dos not found: ${missing.join(', ')}.`) };
            }),
        }),
        defineTool({
            name: 'recall',
            description: 'Look up what is recorded: the schedule beyond this week, lists, memos, logs, projects. With keywords and no kind, it searches them all.',
            parameters: {
                kind: { type: 'string', enum: RECALL_KINDS, description: 'One category; omit to search them all.' },
                name: { type: 'string', description: 'A list\'s, log\'s, or project\'s name.' },
                query: { type: 'string', description: 'Keywords, separated by spaces; a line must contain them all.' },
                from: { type: 'string', description: `First date for the schedule and logs, ${DATE_HINT}.` },
                to: { type: 'string', description: 'Last date for the schedule and logs.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('recall', args), 'read'),
            execute: (args, exec) => run(exec, (target, now) => {
                const invalid = invalidTiming({ date: args.from, endDate: args.to });
                if (invalid !== undefined)
                    return { ok: false, message: invalid };
                return {
                    ok: true,
                    message: recall(target.store, { kind: args.kind, name: args.name, query: args.query, from: args.from, to: args.to }, target.zone, now),
                };
            }),
        }),
    ];
    if (role === 'worker')
        return shared;
    return [
        ...shared,
        defineTool({
            name: 'profile_set',
            description: 'Record a lasting fact about the user that you should always know. It shows in every turn, so keep it short; do not announce it.',
            parameters: {
                field: { type: 'string', required: true, enum: PROFILE_FIELDS, description: 'Where the fact belongs.' },
                value: { type: 'string', required: true, description: 'The fact in a few English words, or the whole new line when replacing. Keep names and words they want used exactly as they wrote them. Time zone takes exactly one IANA name, such as Asia/Shanghai.' },
                mode: { type: 'string', enum: ['add', 'replace'], description: 'add (default) keeps what is there; replace overwrites the line, to correct, remove, or condense it.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('profile_set', args)),
            execute: (args, exec) => run(exec, (target) => {
                const limit = deps.settings().profileMaxChars;
                const zone = args.field === ZONE_FIELD;
                if (zone && validZone(args.value.trim()) === undefined)
                    return { ok: false, message: `"${args.value}" is not a time zone, so nothing was recorded. Use one IANA name, such as Asia/Shanghai or America/New_York.` };
                const text = setProfileField(target.store.read(PROFILE_FILE), args.field, zone ? args.value.trim() : args.value, args.mode === 'replace' || zone ? 'replace' : 'add');
                if (text.length > limit)
                    return { ok: false, message: `That would take the profile over its limit of ${limit} characters, so nothing was recorded. Shorten other lines with replace first.` };
                target.store.write(PROFILE_FILE, text);
                return { ok: true, message: zone ? `Time zone is now ${args.value.trim()}; every time follows it from now on.` : `Recorded under ${args.field}.` };
            }),
        }),
        defineTool({
            name: 'persona_set',
            description: 'Change one adjustable part of how you talk to them, on clear evidence. The change log is written for you; the fixed core cannot change.',
            parameters: {
                field: { type: 'string', required: true, enum: PERSONA_FIELDS, description: 'The part to change.' },
                value: { type: 'string', required: true, description: 'Its new value, in English.' },
                evidence: { type: 'string', required: true, description: 'What they said or the signal you saw at least twice, in English.' },
                requested: { type: 'boolean', description: 'true only when they asked for this themselves; the cooldown then does not apply.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('persona_set', args)),
            execute: (args, exec) => run(exec, (target, now) => {
                const settings = deps.settings();
                const result = setPersonaField(target.store.read(PERSONA_FILE), args.field, args.value, args.evidence, local(now, target.zone).iso, {
                    selfCorrect: settings.personaSelfCorrect,
                    cooldownHours: settings.personaCooldownHours,
                    maxChars: settings.personaMaxChars,
                    changedAt: target.store.mtime(PERSONA_FILE),
                    now,
                    requested: args.requested === true,
                });
                if (!result.ok)
                    return { ok: false, message: result.message };
                target.store.write(PERSONA_FILE, result.text);
                return { ok: true, message: `Adjusted ${args.field}.` };
            }),
        }),
    ];
}
