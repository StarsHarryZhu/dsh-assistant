/**
 * Project files (`projects/<name>.md`): quick edits of a long-running matter's
 * goal, status, to-dos, and notes. Planning and long documents stay a worker's.
 * The model writes them for itself, so they are in English.
 * @module dsh-assisstant/host/records/projects
 */
import { insertInSection, joinLines, linesOf, matching, oneLine, sectionRange } from "./text.js";
export const PROJECTS_FOLDER = 'projects';
const TODO_HEADING = '## To-do';
const NOTES_HEADING = '## Notes';
const TODO = /^- \[( |x|X)\] (.+?)\s*$/u;
/** @returns a new project file. */
function template(name) {
    return `# ${name}\n\n- Goal:\n- Status:\n\n${TODO_HEADING}\n\n${NOTES_HEADING}\n`;
}
/** Set a `- Field: value` line, adding it under the title when missing. */
function setField(lines, field, value) {
    const line = `- ${field}: ${oneLine(value)}`;
    const index = lines.findIndex(existing => existing.trim().startsWith(`- ${field}:`));
    if (index >= 0) {
        lines[index] = line;
        return;
    }
    const title = lines.findIndex(existing => existing.startsWith('# '));
    lines.splice(title + 1, 0, ...(title >= 0 && lines[title + 1]?.trim() === '' ? [] : ['']), line);
}
/**
 * Apply one call's changes.
 * @param text - the file, undefined when absent.
 * @param name - the project's name.
 * @param edit - the changes.
 * @param today - the local date, "YYYY-MM-DD".
 * @returns the new text, and any to-do phrases that matched nothing.
 */
export function editProject(text, name, edit, today) {
    const lines = linesOf(text ?? template(name));
    if (edit.goal !== undefined)
        setField(lines, 'Goal', edit.goal);
    if (edit.status !== undefined)
        setField(lines, 'Status', edit.status);
    const missing = [];
    for (const phrase of edit.checkTodo ?? []) {
        const [from, to] = sectionRange(lines, TODO_HEADING) ?? [0, 0];
        const open = lines.flatMap((line, index) => {
            const match = index >= from && index < to ? TODO.exec(line.trim()) : null;
            return match === null || match[1] !== ' ' ? [] : [{ index, title: match[2] }];
        });
        const found = matching(open, phrase, item => item.title)[0];
        if (found === undefined)
            missing.push(phrase);
        else
            lines[found.index] = `- [x] ${found.title}`;
    }
    for (const todo of edit.addTodo ?? []) {
        const title = oneLine(todo);
        if (title !== '')
            insertInSection(lines, TODO_HEADING, `- [ ] ${title}`);
    }
    if (edit.note !== undefined && oneLine(edit.note) !== '')
        insertInSection(lines, NOTES_HEADING, `- ${today}: ${oneLine(edit.note)}`);
    return { text: joinLines(lines), missing };
}
