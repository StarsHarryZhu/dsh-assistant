/**
 * The record files of one family member's workspace. Every path stays inside
 * the workspace: names from the model pass through `folderName`, which leaves
 * no separators. A write goes to a temporary file first, so a crash never
 * leaves half a file; each tool reads, edits, and writes without yielding, so
 * two calls in this process cannot overwrite each other.
 * @module dsh-assisstant/host/records/store
 */

import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { folderName } from '../../shared/settings.ts'

/** Longest name of a list, log, or project. */
export const MAX_NAME_CHARS = 60

/** @returns the workspace-relative file of a named record: `lists/买菜.md`. */
export function namedFile(folder: string, name: string): string {
  return join(folder, `${folderName(name.trim().slice(0, MAX_NAME_CHARS))}.md`)
}

/** One family member's record files. */
export class RecordStore {
  constructor(readonly root: string) {}

  /** @returns the file's text, or undefined when it cannot be read. */
  read(path: string): string | undefined {
    try {
      return readFileSync(join(this.root, path), 'utf8')
    } catch {
      return undefined
    }
  }

  /** Replace the file, creating its folder. */
  write(path: string, text: string): void {
    const target = join(this.root, path)
    mkdirSync(dirname(target), { recursive: true })
    const temporary = `${target}.${process.pid}.tmp`
    writeFileSync(temporary, text)
    renameSync(temporary, target)
  }

  /** Delete the file if it exists. */
  remove(path: string): void {
    rmSync(join(this.root, path), { force: true })
  }

  /** @returns when the file last changed, epoch milliseconds, or undefined when absent. */
  mtime(path: string): number | undefined {
    try {
      return statSync(join(this.root, path)).mtimeMs
    } catch {
      return undefined
    }
  }

  /** @returns the names of the Markdown files in a folder, sorted, without the extension. */
  names(folder: string): string[] {
    try {
      return readdirSync(join(this.root, folder)).filter(name => name.endsWith('.md')).map(name => name.slice(0, -3)).sort()
    } catch {
      return []
    }
  }
}
