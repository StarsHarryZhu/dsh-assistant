/**
 * The record tools' names and the plain titles their calls show under: the
 * user reads these in the conversation, never a tool's name. Shared by the
 * host's call presentation and the browser half's conversation row.
 * @module dsh-assisstant/shared/record-tools
 */
/** Each record tool, with its label and the argument that names what it touches. */
declare const TITLES: {
    readonly calendar_add: readonly ["记日程", "title"];
    readonly calendar_update: readonly ["改日程", "match"];
    readonly list_update: readonly ["改清单", "list"];
    readonly memo_set: readonly ["记备忘", "key"];
    readonly log_add: readonly ["记流水", "log"];
    readonly project_update: readonly ["改项目", "project"];
    readonly recall: readonly ["查记录", undefined];
    readonly profile_set: readonly ["记下你的信息", undefined];
    readonly persona_set: readonly ["调整说话方式", undefined];
};
/** A record tool's name. */
export type RecordToolName = keyof typeof TITLES;
/** Every record tool. */
export declare const RECORD_TOOLS: RecordToolName[];
/**
 * @param tool - a record tool's name.
 * @param args - its arguments so far; they may be incomplete while it prepares.
 * @returns the plain title: "记日程：看牙医".
 */
export declare function recordToolTitle(tool: RecordToolName, args: Readonly<Record<string, unknown>>): string;
export {};
