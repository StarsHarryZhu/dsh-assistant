/**
 * The record files of one family member's workspace. Every path stays inside
 * the workspace: names from the model pass through `folderName`, which leaves
 * no separators. A write goes to a temporary file first, so a crash never
 * leaves half a file; each tool reads, edits, and writes without yielding, so
 * two calls in this process cannot overwrite each other.
 * @module dsh-assisstant/host/records/store
 */
/** Longest name of a list, log, or project. */
export declare const MAX_NAME_CHARS = 60;
/** @returns the workspace-relative file of a named record: `lists/买菜.md`. */
export declare function namedFile(folder: string, name: string): string;
/** One family member's record files. */
export declare class RecordStore {
    readonly root: string;
    constructor(root: string);
    /** @returns the file's text, or undefined when it cannot be read. */
    read(path: string): string | undefined;
    /** Replace the file, creating its folder. */
    write(path: string, text: string): void;
    /** Delete the file if it exists. */
    remove(path: string): void;
    /** @returns when the file last changed, epoch milliseconds, or undefined when absent. */
    mtime(path: string): number | undefined;
    /** @returns the names of the Markdown files in a folder, sorted, without the extension. */
    names(folder: string): string[];
}
