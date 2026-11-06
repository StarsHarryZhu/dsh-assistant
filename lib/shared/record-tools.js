/**
 * The names of the assistant conversation's own tools and the plain titles their
 * calls show under: the user reads these in the conversation, never a tool's name. Shared by the
 * host's call presentation and the browser half's conversation row.
 * @module dsh-assisstant/shared/record-tools
 */
/** The longest text a title shows of what it touches. */
const MAX_TITLE_VALUE = 60;
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
    im_route: ['回复也发到微信', undefined],
    wake_after: ['稍后再看', 'reason'],
    wake_cancel: ['取消稍后再看', 'match'],
    quiet_set: ['改勿扰时间', undefined],
    brief_set: ['改早上提示时间', 'time'],
    media_copy: ['复制微信发来的文件', 'file'],
};
/** Every record tool. */
export const RECORD_TOOLS = Object.keys(TITLES);
/**
 * @param tool - a record tool's name.
 * @param args - its arguments so far; they may be incomplete while it prepares.
 * @returns the plain title: "记日程：看牙医".
 */
export function recordToolTitle(tool, args) {
    if (tool === 'im_route' && args.send === false)
        return '回复只留在这里';
    const [label, field] = TITLES[tool];
    const value = field === undefined ? undefined : args[field];
    if (typeof value !== 'string' || value.trim() === '')
        return label;
    const shown = (field === 'file' ? value.split(/[/\\]/u).at(-1) ?? value : value).trim();
    const chars = [...shown];
    return `${label}：${chars.length > MAX_TITLE_VALUE ? `${chars.slice(0, MAX_TITLE_VALUE).join('')}…` : shown}`;
}
