/**
 * The profile (`profile.md`): what the assistant should always know about its
 * family member, one line per field, read in full on every turn and therefore
 * held to a length limit.
 * @module dsh-assisstant/host/records/profile
 */
export declare const PROFILE_FILE = "profile.md";
/** The fields of a profile, in file order. */
export declare const PROFILE_FIELDS: readonly ["称呼", "家庭成员", "健康与饮食", "喜好", "不喜欢", "重要日期", "作息与习惯", "其他"];
/** One field. */
export type ProfileField = (typeof PROFILE_FIELDS)[number];
/**
 * Add to a field or replace it.
 * @param text - the file, undefined when absent.
 * @param field - the field.
 * @param value - the fact, or the whole new line when replacing.
 * @param mode - `add` keeps what is there; `replace` overwrites it (an empty value clears it).
 * @returns the new text.
 */
export declare function setProfileField(text: string | undefined, field: ProfileField, value: string, mode: 'add' | 'replace'): string;
