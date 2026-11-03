/**
 * The record tools' names and the plain titles their calls show under: the
 * user reads these in the conversation, never a tool's name. Shared by the
 * host's call presentation and the browser half's conversation row.
 * @module dsh-assisstant/shared/record-tools
 */

/** Each record tool, with its label and the argument that names what it touches. */
const TITLES = {
  calendar_add: ['记日程', 'title'],
  calendar_update: ['改日程', 'match'],
  list_update: ['改清单', 'list'],
  memo_set: ['记备忘', 'key'],
  log_add: ['记流水', 'log'],
  project_update: ['改项目', 'project'],
  recall: ['查记录', undefined],
  profile_set: ['记下你的信息', undefined],
  persona_set: ['调整说话方式', undefined],
} as const satisfies Record<string, readonly [string, string | undefined]>

/** A record tool's name. */
export type RecordToolName = keyof typeof TITLES

/** Every record tool. */
export const RECORD_TOOLS = Object.keys(TITLES) as RecordToolName[]

/**
 * @param tool - a record tool's name.
 * @param args - its arguments so far; they may be incomplete while it prepares.
 * @returns the plain title: "记日程：看牙医".
 */
export function recordToolTitle(tool: RecordToolName, args: Readonly<Record<string, unknown>>): string {
  const [label, field] = TITLES[tool]
  const value = field === undefined ? undefined : args[field]
  return typeof value === 'string' && value.trim() !== '' ? `${label}：${value.trim()}` : label
}
