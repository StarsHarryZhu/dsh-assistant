/**
 * Files the assistant sends to a chat app with its reply: only files inside
 * its workspace (the chat inbox included), checked after following links, so
 * no path or link reaches outside it; each a regular, non-empty file within
 * what im-robot sends. im-robot decides how each shows by its extension.
 * @module dsh-assisstant/host/outbound
 */

import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

/** Largest file sent: im-robot's limit. */
export const MAX_OUTBOUND_FILE_BYTES = 100 * 1024 * 1024

/** Most files one reply carries. */
export const MAX_OUTBOUND_FILES = 9

/** The checked files, as absolute paths, or why none goes. */
export type OutboundFiles =
  | { readonly ok: true; readonly paths: readonly string[] }
  | { readonly ok: false; readonly message: string }

/** @returns the real path, or undefined when nothing is there. */
function realOf(path: string): string | undefined {
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}

/**
 * Check the files a reply should carry.
 * @param root - the assistant's workspace.
 * @param files - paths relative to the workspace, or absolute inside it.
 * @returns their real absolute paths, in order and without repeats, or one plain English reason for the model.
 */
export function outboundFiles(root: string, files: readonly string[]): OutboundFiles {
  if (files.length > MAX_OUTBOUND_FILES) return { ok: false, message: `At most ${MAX_OUTBOUND_FILES} files go with one reply. Send the rest in a later turn.` }
  const realRoot = realOf(root)
  if (realRoot === undefined) return { ok: false, message: 'The workspace folder is missing, so nothing was sent.' }
  const paths: string[] = []
  for (const file of files) {
    const given = file.trim()
    if (given === '') return { ok: false, message: 'A file path is empty.' }
    const full = isAbsolute(given) ? resolve(given) : resolve(root, given)
    const real = realOf(full)
    if (real === undefined) return { ok: false, message: `There is no file ${given} in the workspace.` }
    // A link inside the workspace may point out of it, so the check follows it.
    if (!real.startsWith(`${realRoot}${sep}`)) return { ok: false, message: `${given} is outside the workspace. Only files in the workspace can be sent; ask the user to put it there.` }
    const stats = statSync(real)
    if (!stats.isFile()) return { ok: false, message: `${given} is a folder, not a file.` }
    if (stats.size === 0) return { ok: false, message: `${given} is empty.` }
    if (stats.size > MAX_OUTBOUND_FILE_BYTES) return { ok: false, message: `${given} is over 100 MB, more than the chat app takes.` }
    if (!paths.includes(real)) paths.push(real)
  }
  return { ok: true, paths }
}

/** @returns how a sent file is named to the model: its path in the workspace. */
export function workspaceName(root: string, path: string): string {
  const realRoot = realOf(root) ?? root
  return relative(realRoot, path)
}
