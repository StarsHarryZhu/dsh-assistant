/**
 * The workspace context: the assistant's name and what it calls its family
 * member (both set on the assistant page), `profile.md`, `persona.md` with its
 * self-correction status, the project list, and what the other records hold
 * (names only: the contents are looked up when needed). Read synchronously
 * from the session's folder on every assembly, cut to the configured limits,
 * so the model always sees the files as they are now.
 * @module dsh-assisstant/host/workspace
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LISTS_FOLDER, readList } from "./records/lists.js";
import { LOGS_FOLDER, readLog } from "./records/logs.js";
import { MEMO_FILE, readMemos } from "./records/memos.js";
/** Node's file system, with every failure read as "absent". */
export const nodeFs = {
    read(path) {
        try {
            return readFileSync(path, 'utf8');
        }
        catch {
            return undefined;
        }
    },
    mtime(path) {
        try {
            return statSync(path).mtimeMs;
        }
        catch {
            return undefined;
        }
    },
    list(path) {
        try {
            return readdirSync(path);
        }
        catch {
            return undefined;
        }
    },
};
/** Most project files the context lists. */
const MAX_PROJECTS = 50;
/** Most lists, memo names, or logs the context lists. */
const MAX_NAMES = 50;
/** @returns the Markdown files of a folder, sorted, without the extension. */
function namesIn(fs, folder) {
    return (fs.list(folder) ?? []).filter(name => name.endsWith('.md')).map(name => name.slice(0, -3)).sort();
}
/** @returns the shown names, and how many more there are. */
function shownNames(names) {
    return [...names.slice(0, MAX_NAMES), ...(names.length > MAX_NAMES ? [`… and ${names.length - MAX_NAMES} more`] : [])];
}
/** @returns the text cut to `max` characters with a note telling the model to condense it. */
function capped(text, max, file) {
    const trimmed = text.trim();
    if (trimmed.length <= max)
        return trimmed;
    return `${trimmed.slice(0, max)}\n\n(${file} is longer than ${max} characters and was cut here: condense it below that limit in this turn, keeping the most important facts.)`;
}
/** @returns an instant as "YYYY-MM-DD HH:MM UTC". */
function utc(ms) {
    return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
/**
 * Build the workspace context.
 * @param cwd - the session's folder, or undefined when unknown.
 * @param options - the person's name and the limits.
 * @param now - the current instant, epoch milliseconds.
 * @param fs - the file-system reads.
 * @returns the context text.
 */
export function workspaceText(cwd, options, now, fs = nodeFs) {
    const lines = ['# Family member workspace', ''];
    if (options.name !== undefined)
        lines.push(`- Your name is ${options.name}; the family member chose it. Use it when they ask who you are.`);
    lines.push(options.address === undefined
        ? '- This workspace belongs to one family member. Learn what to call them from profile.md; until then, speak warmly without a form of address.'
        : `- This workspace belongs to one family member, who asked to be called ${options.address}. Call them that unless persona.md or profile.md records that they later asked for another form of address.`);
    if (cwd === undefined) {
        lines.push('- The workspace folder is unknown in this assembly; read the files with relative paths.');
        return lines.join('\n');
    }
    lines.push(`- Workspace folder: ${cwd}. Every file below is relative to it.`);
    const profile = fs.read(join(cwd, 'profile.md'));
    lines.push('', '## profile.md');
    if (profile === undefined || profile.trim() === '') {
        lines.push('No profile yet: this is a new family member. Get to know them naturally while you help, one small thing at a time, never with a questionnaire. Record the first fact as soon as you learn it.');
    }
    else {
        lines.push(capped(profile, options.profileMaxChars, 'profile.md'));
    }
    const personaPath = join(cwd, 'persona.md');
    const persona = fs.read(personaPath);
    lines.push('', '## persona.md');
    lines.push(persona === undefined || persona.trim() === ''
        ? 'No persona.md yet: start from a warm, brief default, and record the first change once you have clear evidence about how this person likes to be spoken to.'
        : capped(persona, options.personaMaxChars, 'persona.md'));
    if (!options.personaSelfCorrect) {
        lines.push('', 'Self-correction is switched off: do not change persona.md.');
    }
    else {
        const changed = persona === undefined ? undefined : fs.mtime(personaPath);
        const until = changed === undefined ? undefined : changed + options.personaCooldownHours * 3_600_000;
        lines.push('', until !== undefined && until > now
            ? `Persona cooldown: last changed ${utc(changed)}; do not change persona.md again before ${utc(until)}.`
            : 'Persona cooldown: over; you may change persona.md when the evidence rules allow it.');
    }
    const projects = (fs.list(join(cwd, 'projects')) ?? []).filter(name => name.endsWith('.md')).sort();
    lines.push('', '## projects/');
    if (projects.length === 0) {
        lines.push('No project files yet.');
    }
    else {
        const shown = projects.slice(0, MAX_PROJECTS).map(name => `- ${name.slice(0, -3)}`);
        lines.push(...shown);
        if (projects.length > MAX_PROJECTS)
            lines.push(`- … and ${projects.length - MAX_PROJECTS} more`);
    }
    const lists = namesIn(fs, join(cwd, LISTS_FOLDER));
    if (lists.length > 0) {
        lines.push('', '## Lists (open items)');
        for (const name of shownNames(lists)) {
            const text = fs.read(join(cwd, LISTS_FOLDER, `${name}.md`));
            lines.push(text === undefined ? `- ${name}` : `- ${name}: ${readList(text).open.length}`);
        }
    }
    const memos = readMemos(fs.read(join(cwd, MEMO_FILE)) ?? '').map(memo => memo.key);
    if (memos.length > 0)
        lines.push('', '## Memos (names; look up the contents)', shownNames(memos).join('、'));
    const logs = namesIn(fs, join(cwd, LOGS_FOLDER));
    if (logs.length > 0) {
        lines.push('', '## Logs (latest entry)');
        for (const name of shownNames(logs)) {
            const latest = readLog(fs.read(join(cwd, LOGS_FOLDER, `${name}.md`)) ?? '').at(-1);
            lines.push(latest === undefined ? `- ${name}` : `- ${name}: ${latest.at.slice(0, 10)}`);
        }
    }
    return lines.join('\n');
}
