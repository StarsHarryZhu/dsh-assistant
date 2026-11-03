/**
 * Memos: facts looked up when needed (`memo.md`), one per line, keyed by a
 * short name, a new value replacing the old: where the keys are, a neighbor's
 * phone number. Only the names reach the model's context.
 * @module dsh-assisstant/host/records/memos
 */
export declare const MEMO_FILE = "memo.md";
/** Longest memo name. */
export declare const MAX_KEY_CHARS = 60;
/** Longest memo value. */
export declare const MAX_VALUE_CHARS = 1000;
/** One memo. */
export interface Memo {
    readonly key: string;
    readonly value: string;
    readonly date: string;
}
/** @returns every memo in the file. */
export declare function readMemos(text: string): Memo[];
/**
 * Write, replace, or (with an empty value) delete a memo.
 * @param text - the file, undefined when absent.
 * @param key - the memo's name.
 * @param value - the new value.
 * @param today - the local date, "YYYY-MM-DD".
 * @returns the new text and what happened.
 */
export declare function setMemo(text: string | undefined, key: string, value: string, today: string): {
    text: string;
    outcome: 'added' | 'replaced' | 'deleted' | 'missing';
};
