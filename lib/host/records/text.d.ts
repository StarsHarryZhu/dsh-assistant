/**
 * Line edits shared by the record formats. Records are edited line by line, so
 * anything a person wrote by hand around them stays as it was.
 * @module dsh-assisstant/host/records/text
 */
/** @returns the text on one line: inner line breaks become spaces. */
export declare function oneLine(text: string): string;
/** @returns the text's lines. */
export declare function linesOf(text: string): string[];
/** @returns the lines as a file: no run of blank lines, and exactly one final line break. */
export declare function joinLines(lines: readonly string[]): string;
/** @returns the index of the last line that passes the test, or -1. */
export declare function lastIndexWhere(lines: readonly string[], test: (line: string) => boolean): number;
/**
 * @param lines - the file.
 * @param heading - the exact heading line.
 * @returns the section's body as [first line, one past the last line], or undefined when absent.
 */
export declare function sectionRange(lines: readonly string[], heading: string): [number, number] | undefined;
/**
 * Insert one line into a section, keeping a blank line around its items.
 * @param lines - the file, edited in place.
 * @param heading - the section's heading; it is added at the end when missing.
 * @param line - the new line.
 * @param before - tells whether the new line goes before an existing item; otherwise it goes last.
 */
export declare function insertInSection(lines: string[], heading: string, line: string, before?: (item: string) => boolean): void;
/**
 * Pick from named things the ones a phrase from the model means: exact matches
 * when there are any, else those containing it, ignoring case.
 * @param items - the candidates.
 * @param phrase - what the model called it.
 * @param nameOf - a candidate's name.
 * @returns the matches.
 */
export declare function matching<T>(items: readonly T[], phrase: string, nameOf: (item: T) => string): T[];
