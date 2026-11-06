/**
 * The assistant conversation's tools beyond its records: reaching the user's
 * chat app, waking itself later, quiet hours, and moving what came in from a chat
 * out of `temp/`. They register in the router preset's scope only, so no other
 * session sees them, and return plain text for the model.
 * @module dsh-assisstant/host/assistant-tools
 */
import { existsSync, mkdirSync, realpathSync, renameSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { assistantSettings } from "../shared/settings.js";
import { recordToolTitle } from "../shared/record-tools.js";
import { local, zonedToUtc } from "./ddl.js";
import { inDailyQuiet, quietSpanAt } from "./quiet.js";
import { invalidTiming } from "./records/calendar.js";
/** The folder things from a chat app are saved in. */
export const TEMP_FOLDER = 'temp';
/** The furthest ahead a wake-up may be, in minutes. */
const MAX_WAKE_MINUTES = 30 * 24 * 60;
const MINUTE_MS = 60_000;
const OUTPUT = {
    schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            ok: { type: 'boolean', required: true },
            message: { type: 'string', required: true },
        },
    },
    render: (_args, value) => [{ type: 'text', text: value.message }],
};
/** What is left to do after sending: the text of a turn no chat message started stays in the app, so this copy reaches only the app. */
const SHOW_IN_APP = 'Now end the turn by writing the same words as your reply, without <keep> markers, so the app shows them too. That copy does not go to WeChat.';
const DATE_HINT = 'YYYY-MM-DD, their local date';
const TIME_HINT = 'HH:MM, 24-hour, their local time';
/** @returns a pending-call card with a plain title; the user reads it in the conversation. */
function card(title) {
    return { card: 'generic', title, kind: 'other' };
}
/**
 * Move a file out of the workspace's `temp/`.
 * @param root - the workspace folder.
 * @param file - the file: its name, its path from the workspace, or its full path.
 * @param to - a folder inside the workspace, created when missing.
 * @returns what became of it.
 */
export function moveFromTemp(root, file, to) {
    const temp = resolve(root, TEMP_FOLDER);
    const source = isAbsolute(file) ? resolve(file) : file.split(/[/\\]/u)[0] === TEMP_FOLDER ? resolve(root, file) : resolve(temp, file);
    const inside = (folder, path) => {
        const rest = relative(folder, path);
        return rest !== '' && !rest.startsWith('..') && !isAbsolute(rest);
    };
    if (!inside(temp, source))
        return { ok: false, message: `Only files in ${TEMP_FOLDER}/ can be moved with this tool.` };
    if (!existsSync(source) || !statSync(source).isFile())
        return { ok: false, message: `There is no file ${relative(root, source)}.` };
    const folder = isAbsolute(to) ? resolve(to) : resolve(root, to);
    if (!inside(root, folder) && folder !== resolve(root))
        return { ok: false, message: 'The target must be a folder inside the workspace.' };
    if (folder === temp || inside(temp, folder))
        return { ok: false, message: `The target must be outside ${TEMP_FOLDER}/.` };
    mkdirSync(folder, { recursive: true });
    // A link inside the workspace may point out of it.
    const real = realpathSync(folder);
    const realRoot = realpathSync(root);
    if (real !== realRoot && !real.startsWith(`${realRoot}${sep}`))
        return { ok: false, message: 'The target must be a folder inside the workspace.' };
    const name = basename(source);
    const extension = extname(name);
    const base = name.slice(0, name.length - extension.length);
    let target = join(folder, name);
    for (let index = 1; existsSync(target); index += 1)
        target = join(folder, `${base}-${index}${extension}`);
    renameSync(source, target);
    return { ok: true, message: `Moved to ${relative(root, target)}.` };
}
/** @returns the instant a wake-up asks for, or why it cannot be used. */
function wakeTime(args, now, zone) {
    if (args.minutes !== undefined) {
        if (!Number.isInteger(args.minutes) || args.minutes < 1)
            return 'minutes must be a whole number of at least 1.';
        if (args.minutes > MAX_WAKE_MINUTES)
            return 'A wake-up can be at most 30 days ahead. Longer plans belong in the schedule.';
        return now + args.minutes * MINUTE_MS;
    }
    if (args.time === undefined)
        return 'Give minutes, or a time with an optional date.';
    const invalid = invalidTiming({ date: args.date, time: args.time });
    if (invalid !== undefined)
        return invalid;
    const at = zonedToUtc(args.date ?? local(now, zone).iso, args.time, zone);
    if (at <= now)
        return 'That time has already passed.';
    if (at > now + MAX_WAKE_MINUTES * MINUTE_MS)
        return 'A wake-up can be at most 30 days ahead. Longer plans belong in the schedule.';
    return at;
}
/** @returns "11/05 14:40". */
function shortTime(ms, zone) {
    const at = local(ms, zone);
    return `${at.short} ${at.time}`;
}
/**
 * Build the router's tools.
 * @param deps - the service and how to read a call's assistant.
 * @returns tool definitions to register in the preset's scope.
 */
export function assistantTools(deps) {
    const clock = () => (deps.now ?? Date.now)();
    const run = async (exec, body) => {
        const agent = exec.agent;
        const person = deps.person(agent);
        if (person === undefined || agent === undefined)
            return { ok: false, message: 'This conversation has no assistant, so nothing was done.' };
        try {
            return await body(person, agent, clock());
        }
        catch (error) {
            return { ok: false, message: `It did not work: ${String(error)}` };
        }
    };
    return [
        defineTool({
            name: 'im_send',
            description: 'Send a message to the user\'s chat app (WeChat). Everything they must see goes out this way unless you are answering a message they just sent from that app. '
                + 'It is cut into short chat messages at sentence breaks; wrap a list or steps that must stay together in <keep> and </keep>. In quiet hours the host holds it and sends it when they end.',
            parameters: {
                text: { type: 'string', required: true, description: 'Plain text in their language, as you would say it in a chat: short, no Markdown.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('im_send', args)),
            execute: (args, exec) => run(exec, (person, agent, now) => {
                if (args.text.trim() === '')
                    return { ok: false, message: 'There is nothing to send.' };
                const outcome = deps.service.sendToChat(person, agent.session.id, args.text);
                if (outcome.status === 'unavailable')
                    return { ok: false, message: 'No chat app is connected, so nothing was sent. Write it as your reply instead.' };
                if (outcome.status === 'held') {
                    return { ok: true, message: `It is quiet hours, so this waits and goes out by itself at ${shortTime(outcome.until ?? now, deps.zone(agent))}. Do not send it again. ${SHOW_IN_APP}` };
                }
                return { ok: true, message: `Sent. ${SHOW_IN_APP}` };
            }),
        }),
        defineTool({
            name: 'wake_after',
            description: 'Wake yourself later, for something with no place in the schedule: "call me in ten minutes", or checking back on something. Things with a time belong in the schedule, which wakes you by itself.',
            parameters: {
                reason: { type: 'string', required: true, description: 'What to do then, in a few words. You read this when you wake.' },
                minutes: { type: 'integer', description: 'How many minutes from now.' },
                date: { type: 'string', description: `The date, ${DATE_HINT}, when not today. Use with time, instead of minutes.` },
                time: { type: 'string', description: `The time, ${TIME_HINT}. Use instead of minutes.` },
                through_quiet: { type: 'boolean', description: 'true only when the user asked to be alerted at exactly this moment inside their quiet hours ("wake me at 3 for my flight").' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('wake_after', args)),
            execute: (args, exec) => run(exec, (person, agent, now) => {
                if (args.reason.trim() === '')
                    return { ok: false, message: 'A wake-up needs a reason.' };
                const zone = deps.zone(agent);
                const at = wakeTime(args, now, zone);
                if (typeof at === 'string')
                    return { ok: false, message: at };
                const throughQuiet = args.through_quiet === true;
                if (throughQuiet && !deps.service.turnFromUser(agent.session.id)) {
                    return { ok: false, message: 'through_quiet is only for a moment the user asks for, and no message of theirs is in this turn. Leave it out.' };
                }
                const added = deps.service.addWake(person, { at, reason: args.reason.trim(), throughQuiet });
                if (added === undefined)
                    return { ok: false, message: 'Too many wake-ups are waiting. Cancel some first.' };
                const span = throughQuiet ? undefined : quietSpanAt(assistantSettings(person), at, zone);
                return {
                    ok: true,
                    message: span === undefined
                        ? `You will be woken at ${shortTime(at, zone)}.`
                        : `That falls in quiet hours, so you will be woken when they end, at ${shortTime(span.end, zone)}.`,
                };
            }),
        }),
        defineTool({
            name: 'wake_cancel',
            description: 'Cancel wake-ups you set, found by words in their reason.',
            parameters: {
                match: { type: 'string', required: true, description: 'Words from the reason.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('wake_cancel', args)),
            execute: (args, exec) => run(exec, (person) => {
                if (args.match.trim() === '')
                    return { ok: false, message: 'Say which wake-up.' };
                const removed = deps.service.cancelWakes(person, args.match);
                return removed.length === 0
                    ? { ok: false, message: `No wake-up mentions "${args.match}".` }
                    : { ok: true, message: `Cancelled: ${removed.map(wake => wake.reason).join('; ')}.` };
            }),
        }),
        defineTool({
            name: 'quiet_set',
            description: 'Change quiet hours, only because the user asked for it in this turn: never because of an event, a task, a report, or your own judgment. '
                + 'Daily hours repeat every day; temporary hours are for now or one stretch ("no messages until 10 tomorrow"), on top of the daily ones.',
            parameters: {
                daily_start: { type: 'string', description: `New start of the daily hours, ${TIME_HINT}. With daily_end. Both empty turn them off.` },
                daily_end: { type: 'string', description: `New end of the daily hours, ${TIME_HINT}.` },
                until_date: { type: 'string', description: `Temporary hours: the last date, ${DATE_HINT}; today when omitted.` },
                until_time: { type: 'string', description: `Temporary hours: when they end, ${TIME_HINT}.` },
                from_date: { type: 'string', description: `Temporary hours: the first date, ${DATE_HINT}, when not starting now.` },
                from_time: { type: 'string', description: `Temporary hours: when they start, ${TIME_HINT}, when not starting now.` },
                clear_temporary: { type: 'boolean', description: 'true ends the temporary hours.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('quiet_set', args)),
            execute: (args, exec) => run(exec, async (person, agent, now) => {
                if (!deps.service.turnFromUser(agent.session.id)) {
                    return { ok: false, message: 'Quiet hours change only when the user asks, and no message of theirs is in this turn, so nothing changed.' };
                }
                const zone = deps.zone(agent);
                const patch = {};
                const said = [];
                if (args.daily_start !== undefined || args.daily_end !== undefined) {
                    const start = args.daily_start ?? '';
                    const end = args.daily_end ?? '';
                    if (start === '' && end === '') {
                        said.push('Daily quiet hours are off.');
                    }
                    else {
                        const invalid = invalidTiming({ time: start, endTime: end });
                        if (invalid !== undefined)
                            return { ok: false, message: invalid };
                        if (start === end)
                            return { ok: false, message: 'The start and the end are the same. Both empty turn daily quiet hours off.' };
                        said.push(`Daily quiet hours are ${start}–${end}.`);
                    }
                    patch.quietStart = start;
                    patch.quietEnd = end;
                }
                if (args.clear_temporary === true) {
                    patch.tempQuietFrom = undefined;
                    patch.tempQuietUntil = undefined;
                    said.push('Temporary quiet hours are off.');
                }
                else if (args.until_time !== undefined) {
                    const invalid = invalidTiming({ date: args.until_date, time: args.until_time, endDate: args.from_date, endTime: args.from_time });
                    if (invalid !== undefined)
                        return { ok: false, message: invalid };
                    const until = zonedToUtc(args.until_date ?? local(now, zone).iso, args.until_time, zone);
                    const from = args.from_time === undefined ? now : zonedToUtc(args.from_date ?? local(now, zone).iso, args.from_time, zone);
                    if (until <= now)
                        return { ok: false, message: 'That end has already passed. Check the date.' };
                    if (until <= from)
                        return { ok: false, message: 'The end is before the start.' };
                    patch.tempQuietFrom = from;
                    patch.tempQuietUntil = until;
                    said.push(`Temporary quiet hours run ${from <= now ? 'from now' : `from ${shortTime(from, zone)}`} until ${shortTime(until, zone)}.`);
                }
                if (Object.keys(patch).length === 0)
                    return { ok: false, message: 'Nothing to change: give daily_start and daily_end, until_time, or clear_temporary.' };
                await deps.service.updateSettings(person.id, patch);
                return { ok: true, message: said.join(' ') };
            }),
        }),
        defineTool({
            name: 'brief_set',
            description: 'Change when the daily brief comes, or turn it off, only because the user asked for it in this turn: never because of an event, a task, or your own judgment.',
            parameters: {
                time: { type: 'string', required: true, description: `The new time, ${TIME_HINT}. Empty turns the daily brief off.` },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('brief_set', args)),
            execute: (args, exec) => run(exec, async (person, agent) => {
                if (!deps.service.turnFromUser(agent.session.id)) {
                    return { ok: false, message: 'The daily brief changes only when the user asks, and no message of theirs is in this turn, so nothing changed.' };
                }
                const time = args.time.trim();
                if (time === '') {
                    await deps.service.updateSettings(person.id, { dailyBriefTime: '' });
                    return { ok: true, message: 'The daily brief is off.' };
                }
                const invalid = invalidTiming({ time });
                if (invalid !== undefined)
                    return { ok: false, message: invalid };
                await deps.service.updateSettings(person.id, { dailyBriefTime: time });
                const settings = assistantSettings(person);
                return {
                    ok: true,
                    message: inDailyQuiet(settings, time)
                        ? `The daily brief is set to ${time}, but that is inside the daily quiet hours (${settings.quietStart}–${settings.quietEnd}), so it will come at ${settings.quietEnd}. Tell them, and change quiet hours only if they say so.`
                        : `The daily brief comes at ${time} from now on.`,
                };
            }),
        }),
        defineTool({
            name: 'temp_move',
            description: `Move a file from ${TEMP_FOLDER}/, where what the user sends from a chat app lands, to a folder in the workspace, such as the one a worker will use.`,
            parameters: {
                file: { type: 'string', required: true, description: `The file: its name in ${TEMP_FOLDER}/, or the path the message gave.` },
                to: { type: 'string', required: true, description: 'The folder, relative to the workspace, such as projects/装修. Created when missing.' },
            },
            output: OUTPUT,
            presentCall: args => card(recordToolTitle('temp_move', args)),
            execute: (args, exec) => run(exec, (person) => {
                if (person.cwd === undefined)
                    return { ok: false, message: 'This assistant has no workspace.' };
                return moveFromTemp(person.cwd, args.file, args.to);
            }),
        }),
    ];
}
