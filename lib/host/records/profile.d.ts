/**
 * The profile (`profile.md`): what the assistant should always know about its
 * family member, one line per field, read in full on every turn and therefore
 * held to a length limit. The model writes it for itself, so it is in English.
 * @module dsh-assisstant/host/records/profile
 */
export declare const PROFILE_FILE = "profile.md";
/** The fields of a profile, in file order. */
export declare const PROFILE_FIELDS: readonly ["Form of address", "Health and diet", "Likes", "Dislikes", "Important dates", "Routines and habits", "Other"];
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
