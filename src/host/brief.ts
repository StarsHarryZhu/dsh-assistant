/**
 * The daily brief: once a day at their assistant's local time, a family member
 * whose `ddl.md` has open items today gets a short reminder from their
 * conversation. The decision is the fast path (the parsed file, no model):
 * a free day sends nothing and costs nothing. The day each person was last
 * handled is stored, so a restart never sends a second brief.
 * @module dsh-assisstant/host/brief
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Person } from '../shared/settings.ts'
import { parseDdl, todayItems } from './ddl.ts'
import { SYSTEM_PREFIX } from './watchdog.ts'

/** What the brief needs from the plugin. */
export interface BriefDeps {
  now(): Date
  /** This person's `HH:MM`, or an empty string when their brief is off. */
  time(person: Person): string
  people(): readonly Person[]
  /** The person's current IANA zone. */
  zoneFor(person: Person): string
  /** Read a file, undefined when absent. */
  read(path: string): string | undefined
  /** Send the brief note into the person's conversation. */
  send(sessionId: string, text: string): void
  /** Where the handled days are stored. */
  statePath: string
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/u

/** @returns the zone's local date and time, as "YYYY-MM-DD" and "HH:MM". */
function localNow(now: Date, zone: string): { date: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

/**
 * The note a brief sends.
 * @param items - today's labels.
 * @returns the system note.
 */
export function briefText(items: readonly string[]): string {
  return [
    `${SYSTEM_PREFIX} Daily brief: the family member's plans for today, in their local time.`,
    ...items.map(item => `- ${item}`),
    'Remind them in one or two warm, plain sentences of what they have to do today, the most pressing first. Do not list every detail, and do not mention that this is a system message.',
  ].join('\n')
}

/** Sends each person's brief once a day. */
export class DailyBrief {
  private handled: Record<string, string>

  constructor(private readonly deps: BriefDeps) {
    this.handled = this.load()
  }

  /** @returns person id → the local date last handled. */
  private load(): Record<string, string> {
    try {
      const value = JSON.parse(readFileSync(this.deps.statePath, 'utf8')) as unknown
      return value !== null && typeof value === 'object' ? value as Record<string, string> : {}
    } catch {
      return {}
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.deps.statePath), { recursive: true })
      writeFileSync(this.deps.statePath, `${JSON.stringify(this.handled, null, 2)}\n`)
    } catch {
      // A lost state file can only cause a second brief after a restart.
    }
  }

  /**
   * Check every person once; call this every minute.
   * @returns the session ids a brief was sent to.
   */
  tick(): string[] {
    const now = this.deps.now()
    const sent: string[] = []
    let changed = false
    for (const person of this.deps.people()) {
      if (person.sessionId === undefined || person.cwd === undefined) continue
      const target = this.deps.time(person).trim()
      if (!TIME.test(target)) continue
      const zone = this.deps.zoneFor(person)
      const { date, time } = localNow(now, zone)
      if (time < target || this.handled[person.id] === date) continue
      this.handled[person.id] = date
      changed = true
      const file = this.deps.read(`${person.cwd}/ddl.md`)
      const items = file === undefined ? [] : todayItems(parseDdl(file), now, zone)
      if (items.length === 0) continue
      this.deps.send(person.sessionId, briefText(items))
      sent.push(person.sessionId)
    }
    if (changed) this.save()
    return sent
  }
}
