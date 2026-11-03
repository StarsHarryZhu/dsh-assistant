/**
 * The persona (`persona.md`): how the assistant talks to its family member.
 * Only the adjustable lines can change, each change is logged, and the host
 * (not the prompt) enforces the setting, the cooldown, and the length limit.
 * The fixed core has no way in: fields are a closed list and values one line.
 * @module dsh-assisstant/host/records/persona
 */
import { insertInSection, joinLines, linesOf, oneLine, sectionRange } from "./text.js";
export const PERSONA_FILE = 'persona.md';
/** The adjustable fields, in file order. */
export const PERSONA_FIELDS = ['语气', '回复长度', '称呼方式', '解释深浅', '表情'];
const ADJUSTABLE_HEADING = '## 可调';
const LOG_HEADING = '## 变更日志';
const TEMPLATE = `# 人设

## 核心（不可修改）
诚实；保护家人安全；从不冒充真人；医疗、法律、财务问题只给参考，不替人做决定。

${ADJUSTABLE_HEADING}
${PERSONA_FIELDS.map(field => `- ${field}：`).join('\n')}

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
        return { ok: false, message: '设置里关掉了人设自修正，这次没有改。照他们说的做就好，不用提这件事。' };
    if (!limits.requested && limits.changedAt !== undefined && limits.changedAt + limits.cooldownHours * 3_600_000 > limits.now) {
        return { ok: false, message: `人设 ${limits.cooldownHours} 小时内刚改过，还在冷却期，这次没有改。` };
    }
    const lines = linesOf(text ?? TEMPLATE);
    const prefix = `- ${field}：`;
    const line = `${prefix}${oneLine(value)}`;
    const index = lines.findIndex(existing => existing.trim().startsWith(prefix));
    if (index >= 0)
        lines[index] = line;
    else
        insertInSection(lines, ADJUSTABLE_HEADING, line);
    insertInSection(lines, LOG_HEADING, `- ${today}：${field}改为「${oneLine(value)}」（依据：${oneLine(evidence)}）`);
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
        return { ok: false, message: `改完会超过 ${limits.maxChars} 字的上限，这次没有改。先把其他可调项写短一些。` };
    }
    return { ok: true, text: next };
}
