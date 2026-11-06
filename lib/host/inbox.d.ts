/**
 * The chat inbox: the workspace folder `IM/<app>/` where what the user sends
 * from a chat app lands (im-robot saves it there), kept for the days the
 * assistant's settings say and then removed. Nobody works on a file in place:
 * whoever needs one copies it out to a folder of their own first, so the inbox
 * can be cleared without losing work. Files from before the inbox existed are
 * in `temp/` and may be copied out the same way.
 * @module dsh-assisstant/host/inbox
 */
/** The inbox folder in a workspace. */
export declare const INBOX_FOLDER = "IM";
/** WeChat's folder in the inbox. */
export declare const WECHAT_FOLDER = "IM/WeChat";
/** Where chat files landed before the inbox existed (dsh-assistant 0.2.0 development builds). */
export declare const LEGACY_TEMP_FOLDER = "temp";
/** @returns WeChat's inbox folder in a workspace. */
export declare function wechatFolder(cwd: string): string;
/**
 * Remove the files in a chat folder older than `keepDays`, by when they were
 * saved. Only plain files directly in the folder go; links and folders stay.
 * @param folder - one chat app's inbox folder.
 * @param keepDays - days to keep; 0 keeps everything.
 * @param now - epoch milliseconds.
 * @returns how many files were removed.
 */
export declare function pruneOldFiles(folder: string, keepDays: number, now: number): number;
/**
 * The name a copy gets: the name the file was sent with, without the time the
 * inbox put in front, unless that leaves only a generic name (`image.jpg`).
 * @param saved - the name in the inbox.
 * @returns the copy's name.
 */
export declare function copyName(saved: string): string;
/** A copy's result, for the model. */
export interface CopyOutcome {
    ok: boolean;
    message: string;
}
/**
 * Copy a file out of the chat inbox (or the old `temp/`) into a folder of the
 * workspace, under a free name. The original stays for the inbox's own clean-up.
 * @param root - the workspace folder.
 * @param file - the file: its path from the workspace, its full path, or its name in WeChat's inbox.
 * @param to - a folder inside the workspace and outside the inbox, created when missing.
 * @returns where the copy went, or why there is none.
 */
export declare function copyFromInbox(root: string, file: string, to: string): CopyOutcome;
