/**
 * The chat inbox: the workspace folder `IM/<app>/` where what the user sends
 * from a chat app lands (im-robot saves it there), kept for the days the
 * assistant's settings say and then removed. Nobody works on a file in place:
 * whoever needs one copies it out to a folder of their own first, so the inbox
 * can be cleared without losing work. Files from before the inbox existed are
 * in `temp/` and may be copied out the same way.
 * @module dsh-assisstant/host/inbox
 */

import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, statSync, unlinkSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** The inbox folder in a workspace. */
export const INBOX_FOLDER = 'IM'

/** WeChat's folder in the inbox. */
export const WECHAT_FOLDER = `${INBOX_FOLDER}/WeChat`

/** Where chat files landed before the inbox existed (dsh-assistant 0.2.0 development builds). */
export const LEGACY_TEMP_FOLDER = 'temp'

const DAY_MS = 86_400_000

/** @returns WeChat's inbox folder in a workspace. */
export function wechatFolder(cwd: string): string {
  return join(cwd, INBOX_FOLDER, 'WeChat')
}

/** @returns whether `path` lies strictly inside `folder`. */
function inside(folder: string, path: string): boolean {
  const rest = relative(folder, path)
  return rest !== '' && !rest.startsWith('..') && !isAbsolute(rest)
}

/**
 * Remove the files in a chat folder older than `keepDays`, by when they were
 * saved. Only plain files directly in the folder go; links and folders stay.
 * @param folder - one chat app's inbox folder.
 * @param keepDays - days to keep; 0 keeps everything.
 * @param now - epoch milliseconds.
 * @returns how many files were removed.
 */
export function pruneOldFiles(folder: string, keepDays: number, now: number): number {
  if (!(keepDays > 0) || !existsSync(folder)) return 0
  const cutoff = now - keepDays * DAY_MS
  let removed = 0
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(folder, entry.name)
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.mtimeMs >= cutoff) continue
    unlinkSync(path)
    removed += 1
  }
  return removed
}

/**
 * The name a copy gets: the name the file was sent with, without the time the
 * inbox put in front, unless that leaves only a generic name (`image.jpg`).
 * @param saved - the name in the inbox.
 * @returns the copy's name.
 */
export function copyName(saved: string): string {
  const sent = saved.replace(/^\d{8}-\d{6}-/u, '')
  return sent === '' || /^(?:image|file|voice|video)(?:-\d+)?\.[a-z0-9]+$/iu.test(sent) ? saved : sent
}

/** A copy's result, for the model. */
export interface CopyOutcome {
  ok: boolean
  message: string
}

/**
 * Copy a file out of the chat inbox (or the old `temp/`) into a folder of the
 * workspace, under a free name. The original stays for the inbox's own clean-up.
 * @param root - the workspace folder.
 * @param file - the file: its path from the workspace, its full path, or its name in WeChat's inbox.
 * @param to - a folder inside the workspace and outside the inbox, created when missing.
 * @returns where the copy went, or why there is none.
 */
export function copyFromInbox(root: string, file: string, to: string): CopyOutcome {
  const inbox = resolve(root, INBOX_FOLDER)
  const temp = resolve(root, LEGACY_TEMP_FOLDER)
  const first = file.split(/[/\\]/u)[0]
  const source = isAbsolute(file)
    ? resolve(file)
    : first === INBOX_FOLDER || first === LEGACY_TEMP_FOLDER ? resolve(root, file) : resolve(wechatFolder(root), file)
  if (!inside(inbox, source) && !inside(temp, source)) {
    return { ok: false, message: `Only files in ${INBOX_FOLDER}/ (or the older ${LEGACY_TEMP_FOLDER}/) are copied with this tool. A file elsewhere in the workspace can be used where it is.` }
  }
  if (!existsSync(source) || !statSync(source).isFile()) {
    return { ok: false, message: `There is no file ${relative(root, source)}. Files in ${INBOX_FOLDER}/ are removed after the days the settings keep them; ask the user to send it again.` }
  }
  const folder = isAbsolute(to) ? resolve(to) : resolve(root, to)
  if (folder !== resolve(root) && !inside(root, folder)) return { ok: false, message: 'The target must be a folder inside the workspace, such as projects/装修 or files.' }
  if (folder === inbox || inside(inbox, folder)) return { ok: false, message: `The target must be outside ${INBOX_FOLDER}/: that folder is cleared on its own.` }
  mkdirSync(folder, { recursive: true })
  // A link inside the workspace may point out of it.
  const real = realpathSync(folder)
  const realRoot = realpathSync(root)
  if (real !== realRoot && !real.startsWith(`${realRoot}${sep}`)) return { ok: false, message: 'The target must be a folder inside the workspace.' }
  const name = copyName(basename(source))
  const extension = extname(name)
  const base = name.slice(0, name.length - extension.length)
  let target = join(folder, name)
  for (let index = 1; existsSync(target); index += 1) target = join(folder, `${base}-${index}${extension}`)
  copyFileSync(source, target, constants.COPYFILE_EXCL)
  return { ok: true, message: `Copied to ${relative(root, target)}. Work on that copy, never on the file in ${INBOX_FOLDER}/.` }
}
