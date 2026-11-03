/**
 * The daily brief: once a day at their assistant's local time, a family member
 * whose `ddl.md` has open items today gets a short reminder from their
 * conversation. The decision is the fast path (the parsed file, no model):
 * a free day sends nothing and costs nothing. The day each person was last
 * handled is stored, so a restart never sends a second brief.
 * @module dsh-assisstant/host/brief
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDdl, todayItems } from "./ddl.js";
import { SYSTEM_PREFIX } from "./watchdog.js";
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/u;
/** @returns the zone's local date and time, as "YYYY-MM-DD" and "HH:MM". */
function localNow(now, zone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(part => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
/**
 * The note a brief sends.
 * @param items - today's labels.
 * @returns the system note.
 */
export function briefText(items) {
    return [
        `${SYSTEM_PREFIX} Daily brief: the family member's plans for today, in their local time.`,
        ...items.map(item => `- ${item}`),
        'Remind them in one or two warm, plain sentences of what they have to do today, the most pressing first. Do not list every detail, and do not mention that this is a system message.',
    ].join('\n');
}
/** Sends each person's brief once a day. */
export class DailyBrief {
    deps;
    handled;
    constructor(deps) {
        this.deps = deps;
        this.handled = this.load();
    }
    /** @returns person id → the local date last handled. */
    load() {
        try {
            const value = JSON.parse(readFileSync(this.deps.statePath, 'utf8'));
            return value !== null && typeof value === 'object' ? value : {};
        }
        catch {
            return {};
        }
    }
    save() {
        try {
            mkdirSync(dirname(this.deps.statePath), { recursive: true });
            writeFileSync(this.deps.statePath, `${JSON.stringify(this.handled, null, 2)}\n`);
        }
        catch {
            // A lost state file can only cause a second brief after a restart.
        }
    }
    /**
     * Check every person once; call this every minute.
     * @returns the session ids a brief was sent to.
     */
    tick() {
        const now = this.deps.now();
        const sent = [];
        let changed = false;
        for (const person of this.deps.people()) {
            if (person.sessionId === undefined || person.cwd === undefined)
                continue;
            const target = this.deps.time(person).trim();
            if (!TIME.test(target))
                continue;
            const zone = this.deps.zoneFor(person);
            const { date, time } = localNow(now, zone);
            if (time < target || this.handled[person.id] === date)
                continue;
            this.handled[person.id] = date;
            changed = true;
            const file = this.deps.read(`${person.cwd}/ddl.md`);
            const items = file === undefined ? [] : todayItems(parseDdl(file), now, zone);
            if (items.length === 0)
                continue;
            this.deps.send(person.sessionId, briefText(items));
            sent.push(person.sessionId);
        }
        if (changed)
            this.save();
        return sent;
    }
}
