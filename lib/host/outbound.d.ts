/**
 * Files the assistant sends to a chat app with its reply: only files inside
 * its workspace (the chat inbox included), checked after following links, so
 * no path or link reaches outside it; each a regular, non-empty file within
 * what im-robot sends. im-robot decides how each shows by its extension.
 * @module dsh-assisstant/host/outbound
 */
/** Largest file sent: im-robot's limit. */
export declare const MAX_OUTBOUND_FILE_BYTES: number;
/** Most files one reply carries. */
export declare const MAX_OUTBOUND_FILES = 9;
/** The checked files, as absolute paths, or why none goes. */
export type OutboundFiles = {
    readonly ok: true;
    readonly paths: readonly string[];
} | {
    readonly ok: false;
    readonly message: string;
};
/**
 * Check the files a reply should carry.
 * @param root - the assistant's workspace.
 * @param files - paths relative to the workspace, or absolute inside it.
 * @returns their real absolute paths, in order and without repeats, or one plain English reason for the model.
 */
export declare function outboundFiles(root: string, files: readonly string[]): OutboundFiles;
/** @returns how a sent file is named to the model: its path in the workspace. */
export declare function workspaceName(root: string, path: string): string;
