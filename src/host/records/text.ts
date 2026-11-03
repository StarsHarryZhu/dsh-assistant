/**
 * Line edits shared by the record formats. Records are edited line by line, so
 * anything a person wrote by hand around them stays as it was.
 * @module dsh-assisstant/host/records/text
 */

/** @returns the text on one line: inner line breaks become spaces. */
export function oneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/gu, ' ').trim()
}

/** @returns the text's lines. */
export function linesOf(text: string): string[] {
  return text.split('\n')
}

/** @returns the lines as a file: no run of blank lines, and exactly one final line break. */
export function joinLines(lines: readonly string[]): string {
  return `${lines.join('\n').replace(/\n{3,}/gu, '\n\n').replace(/\s+$/u, '')}\n`
}

/** @returns the index of the last line that passes the test, or -1. */
export function lastIndexWhere(lines: readonly string[], test: (line: string) => boolean): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) if (test(lines[index] as string)) return index
  return -1
}

/**
 * @param lines - the file.
 * @param heading - the exact heading line.
 * @returns the section's body as [first line, one past the last line], or undefined when absent.
 */
export function sectionRange(lines: readonly string[], heading: string): [number, number] | undefined {
  const start = lines.findIndex(line => line.trim() === heading)
  if (start < 0) return undefined
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return [start + 1, next < 0 ? lines.length : next]
}

/**
 * Insert one line into a section, keeping a blank line around its items.
 * @param lines - the file, edited in place.
 * @param heading - the section's heading; it is added at the end when missing.
 * @param line - the new line.
 * @param before - tells whether the new line goes before an existing item; otherwise it goes last.
 */
export function insertInSection(lines: string[], heading: string, line: string, before: (item: string) => boolean = () => false): void {
  let range = sectionRange(lines, heading)
  if (range === undefined) {
    while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop()
    lines.push('', heading)
    range = [lines.length, lines.length]
  }
  const [from, to] = range
  const items: number[] = []
  for (let index = from; index < to; index += 1) if (lines[index]?.trim() !== '') items.push(index)
  const last = items[items.length - 1]
  if (last === undefined) {
    lines.splice(from, to - from, '', line, '')
    return
  }
  const first = items.find(index => before(lines[index] as string))
  lines.splice(first ?? last + 1, 0, line)
}

/**
 * Pick from named things the ones a phrase from the model means: exact matches
 * when there are any, else those containing it, ignoring case.
 * @param items - the candidates.
 * @param phrase - what the model called it.
 * @param nameOf - a candidate's name.
 * @returns the matches.
 */
export function matching<T>(items: readonly T[], phrase: string, nameOf: (item: T) => string): T[] {
  const needle = phrase.trim().toLowerCase()
  if (needle === '') return []
  const exact = items.filter(item => nameOf(item).toLowerCase() === needle)
  return exact.length > 0 ? exact : items.filter(item => nameOf(item).toLowerCase().includes(needle))
}
