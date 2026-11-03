/**
 * Line edits shared by the record formats. Records are edited line by line, so
 * anything a person wrote by hand around them stays as it was.
 * @module dsh-assisstant/host/records/text
 */
/** @returns the text on one line: inner line breaks become spaces. */
export function oneLine(text) {
    return text.replace(/\s*[\r\n]+\s*/gu, ' ').trim();
}
/** @returns the text's lines. */
export function linesOf(text) {
    return text.split('\n');
}
/** @returns the lines as a file: no run of blank lines, and exactly one final line break. */
export function joinLines(lines) {
    return `${lines.join('\n').replace(/\n{3,}/gu, '\n\n').replace(/\s+$/u, '')}\n`;
}
/** @returns the index of the last line that passes the test, or -1. */
export function lastIndexWhere(lines, test) {
    for (let index = lines.length - 1; index >= 0; index -= 1)
        if (test(lines[index]))
            return index;
    return -1;
}
/**
 * @param lines - the file.
 * @param heading - the exact heading line.
 * @returns the section's body as [first line, one past the last line], or undefined when absent.
 */
export function sectionRange(lines, heading) {
    const start = lines.findIndex(line => line.trim() === heading);
    if (start < 0)
        return undefined;
    const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
    return [start + 1, next < 0 ? lines.length : next];
}
/**
 * Insert one line into a section, keeping a blank line around its items.
 * @param lines - the file, edited in place.
 * @param heading - the section's heading; it is added at the end when missing.
 * @param line - the new line.
 * @param before - tells whether the new line goes before an existing item; otherwise it goes last.
 */
export function insertInSection(lines, heading, line, before = () => false) {
    let range = sectionRange(lines, heading);
    if (range === undefined) {
        while (lines.length > 0 && lines[lines.length - 1]?.trim() === '')
            lines.pop();
        lines.push('', heading);
        range = [lines.length, lines.length];
    }
    const [from, to] = range;
    const items = [];
    for (let index = from; index < to; index += 1)
        if (lines[index]?.trim() !== '')
            items.push(index);
    const last = items[items.length - 1];
    if (last === undefined) {
        lines.splice(from, to - from, '', line, '');
        return;
    }
    const first = items.find(index => before(lines[index]));
    lines.splice(first ?? last + 1, 0, line);
}
/**
 * Pick from named things the ones a phrase from the model means: exact matches
 * when there are any, else those containing it, ignoring case.
 * @param items - the candidates.
 * @param phrase - what the model called it.
 * @param nameOf - a candidate's name.
 * @returns the matches.
 */
export function matching(items, phrase, nameOf) {
    const needle = phrase.trim().toLowerCase();
    if (needle === '')
        return [];
    const exact = items.filter(item => nameOf(item).toLowerCase() === needle);
    return exact.length > 0 ? exact : items.filter(item => nameOf(item).toLowerCase().includes(needle));
}
