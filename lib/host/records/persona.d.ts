/**
 * The persona (`persona.md`): how the assistant talks to its user.
 * Only the adjustable lines can change, each change is logged, and the host
 * (not the prompt) enforces the setting, the cooldown, and the length limit.
 * The fixed core has no way in: fields are a closed list and values one line.
 * The model writes it for itself, so it is in English.
 * @module dsh-assisstant/host/records/persona
 */
export declare const PERSONA_FILE = "persona.md";
/** The adjustable fields, in file order. */
export declare const PERSONA_FIELDS: readonly ["Tone", "Reply length", "Form of address", "Depth of explanation", "Emoji"];
/** One adjustable field. */
export type PersonaField = (typeof PERSONA_FIELDS)[number];
/** What decides whether a change may happen. */
export interface PersonaLimits {
    readonly selfCorrect: boolean;
    readonly cooldownHours: number;
    readonly maxChars: number;
    /** When the file last changed, epoch milliseconds; undefined when it does not exist. */
    readonly changedAt: number | undefined;
    readonly now: number;
    /** The user asked for this change themselves, which the cooldown does not hold back. */
    readonly requested: boolean;
}
/** The outcome: the new text, or why not. */
export type PersonaResult = {
    readonly ok: true;
    readonly text: string;
} | {
    readonly ok: false;
    readonly message: string;
};
/**
 * Change one adjustable field and log it.
 * @param text - the file, undefined when absent.
 * @param field - the field.
 * @param value - its new value.
 * @param evidence - why: their words, or the signal seen at least twice.
 * @param today - the local date, "YYYY-MM-DD".
 * @param limits - the setting, the cooldown, and the length limit.
 * @returns the outcome.
 */
export declare function setPersonaField(text: string | undefined, field: PersonaField, value: string, evidence: string, today: string, limits: PersonaLimits): PersonaResult;
