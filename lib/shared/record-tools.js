/**
 * The record tools' names and the plain titles their calls show under: the
 * family reads these in the conversation, never a tool's name. Shared by the
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
    profile_set: ['记下家人的信息', undefined],
    persona_set: ['调整说话方式', undefined],
};
/** Every record tool. */
export const RECORD_TOOLS = Object.keys(TITLES);
/**
 * @param tool - a record tool's name.
 * @param args - its arguments so far; they may be incomplete while it prepares.
 * @returns the plain title: "记日程：看牙医".
 */
export function recordToolTitle(tool, args) {
    const [label, field] = TITLES[tool];
    const value = field === undefined ? undefined : args[field];
    return typeof value === 'string' && value.trim() !== '' ? `${label}：${value.trim()}` : label;
}
