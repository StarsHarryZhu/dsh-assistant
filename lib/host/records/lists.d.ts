/**
 * Lists: a named group of things ticked off one by one (`lists/<名>.md`).
 * Ticked items stay a week so a mistake can be undone, then go.
 * @module dsh-assisstant/host/records/lists
 */
export declare const LISTS_FOLDER = "lists";
/** The changes one call makes. */
export interface ListEdit {
    readonly add?: readonly string[] | undefined;
    readonly check?: readonly string[] | undefined;
    readonly uncheck?: readonly string[] | undefined;
    readonly remove?: readonly string[] | undefined;
}
/** @returns the open and done item titles of a list file. */
export declare function readList(text: string): {
    open: string[];
    done: string[];
};
/**
 * Apply one call's changes.
 * @param text - the file, undefined when absent.
 * @param name - the list's name.
 * @param edit - the changes.
 * @param today - the local date, "YYYY-MM-DD".
 * @returns the new text, and any phrases that matched nothing.
 */
export declare function editList(text: string | undefined, name: string, edit: ListEdit, today: string): {
    text: string;
    missing: string[];
};
