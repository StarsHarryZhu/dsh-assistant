/**
 * The persona (`persona.md`): how the assistant talks to its user.
 * Only the adjustable lines can change, each change is logged, and the host
 * (not the prompt) enforces the setting, the cooldown, and the length limit.
 * The fixed core has no way in: fields are a closed list and values one line.
 * The model writes it for itself, so it is in English.
 * @module dsh-assisstant/host/records/persona
 */
import { insertInSection, joinLines, linesOf, oneLine, sectionRange } from "./text.js";
export const PERSONA_FILE = 'persona.md';
/** The adjustable fields, in file order. */
export const PERSONA_FIELDS = ['Tone', 'Reply length', 'Form of address', 'Depth of explanation', 'Emoji'];
const ADJUSTABLE_HEADING = '## Adjustable';
const LOG_HEADING = '## Change log';
const TEMPLATE = `# Persona

## Core (fixed)
Honest. Protects the user's safety. Never pretends to be a real person. Gives medical, legal, and financial information for reference only and never decides for them.

${ADJUSTABLE_HEADING}
${PERSONA_FIELDS.map(field => `- ${field}:`).join('\n')}

${LOG_HEADING}
`;
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
export function setPersonaField(text, field, value, evidence, today, limits) {
    if (!limits.selfCorrect)
        return { ok: false, message: 'Persona self-correction is switched off in the settings, so nothing changed. Just do as they say, without mentioning this.' };
    if (!limits.requested && limits.changedAt !== undefined && limits.changedAt + limits.cooldownHours * 3_600_000 > limits.now) {
        return { ok: false, message: `The persona changed within the last ${limits.cooldownHours} hours and is still cooling down, so nothing changed.` };
    }
    const lines = linesOf(text ?? TEMPLATE);
    const prefix = `- ${field}:`;
    const line = `${prefix} ${oneLine(value)}`;
    const index = lines.findIndex(existing => existing.trim().startsWith(prefix));
    if (index >= 0)
        lines[index] = line;
    else
        insertInSection(lines, ADJUSTABLE_HEADING, line);
    insertInSection(lines, LOG_HEADING, `- ${today}: ${field} changed to "${oneLine(value)}" (evidence: ${oneLine(evidence)})`);
    // The log is what grows: its oldest lines go first, and the latest change always stays.
    const [from, to] = sectionRange(lines, LOG_HEADING);
    const entries = lines.slice(from, to).filter(entry => entry.trim() !== '');
    lines.splice(from, to - from, '', ...entries);
    while (joinLines(lines).length > limits.maxChars && entries.length > 1) {
        entries.shift();
        lines.splice(from + 1, 1);
    }
    const next = joinLines(lines);
    if (next.length > limits.maxChars) {
        return { ok: false, message: `That would exceed the limit of ${limits.maxChars} characters, so nothing changed. Shorten the other adjustable lines first.` };
    }
    return { ok: true, text: next };
}
