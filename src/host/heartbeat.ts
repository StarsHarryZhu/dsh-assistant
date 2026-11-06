/**
 * The heartbeat: everything an assistant does on its own, without the host's
 * automation tasks. Checked once a minute per assistant, it wakes the assistant
 * conversation with one note when something is due:
 *
 * - the daily brief at its set time, every day, even when today is free;
 * - a timed item's reminder at its lead time, read from `ddl.md` each time, so a
 *   changed or cancelled item needs nothing kept in step;
 * - a wake-up the model set for itself (`wake_after`);
 * - the heartbeat itself every `heartbeatMinutes`, which reaches the model only
 *   while `heartbeatIdleWake` is on when nothing else is due.
 *
 * Inside quiet hours nothing fires but a wake-up the user asked to come through
 * them. A chat message the model sent in quiet hours waits here, and goes out when
 * they end without calling the model. Each assistant's state is a file in the
 * plugin's data folder, so a restart repeats nothing and misses nothing that is
 * still ahead.
 * @module dsh-assisstant/host/heartbeat
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assistantSettings, folderName } from '../shared/settings.ts'
import type { AssistantSettings, Person } from '../shared/settings.ts'
import { weekdayOf } from './calendar.ts'
import { local, parseDdl, repeatsOn, todayItems, zonedToUtc } from './ddl.ts'
import type { DdlEntry } from './ddl.ts'
import { quietSpanAt, remindAt } from './quiet.ts'
import { CALENDAR_FILE, hasClockTime, isMuted } from './records/calendar.ts'
import type { ReminderRecordLike, ScheduleLike } from './types.ts'
import { SYSTEM_PREFIX } from './watchdog.ts'

/**
 * Remove a session's automation tasks, which earlier versions used for reminders and the heartbeat replaces.
 * Each change is made as that session, so its own agent is not told about it.
 * @param schedule - the host's schedule service, in either shape.
 * @param sessionId - the assistant conversation.
 */
export async function clearAutomationTasks(schedule: ScheduleLike, sessionId: string): Promise<void> {
  if (schedule.catalog !== undefined && schedule.edit !== undefined) {
    await schedule.stopSessionTasks?.(sessionId)
    const left = (await schedule.catalog()).filter(task => task.target?.kind !== undefined && task.target.sessionId === sessionId)
    for (const task of left) await schedule.edit({ id: task.id, action: 'delete' }, sessionId)
    return
  }
  if (schedule.list === undefined || schedule.delete === undefined) return
  const tasks = await schedule.list({ sessionId })
  if (!Array.isArray(tasks)) return
  for (const task of tasks as readonly ReminderRecordLike[]) await schedule.delete({ sessionId, id: task.id })
}

/** A time the model asked to be woken. */
export interface WakeRequest {
  readonly id: string
  /** Epoch milliseconds. */
  readonly at: number
  readonly reason: string
  /** The user asked for exactly this moment, so quiet hours do not hold it back. */
  readonly throughQuiet: boolean
}

/** A chat message waiting for quiet hours to end. */
interface HeldMessage {
  readonly text: string
  readonly at: number
}

/** What is kept about one assistant between ticks and restarts. */
interface HeartbeatState {
  /** Up to when reminders have been looked at. */
  lastCheckedAt?: number
  lastBeatAt?: number
  /** The local date of the latest daily brief. */
  briefDate?: string
  /** Reminders already given: item key → when the event starts. */
  reminded: Record<string, number>
  wakes: WakeRequest[]
  held: HeldMessage[]
}

/** What the heartbeat needs from the plugin. */
export interface HeartbeatDeps {
  now(): number
  people(): readonly Person[]
  /** The user's IANA zone. */
  zoneFor(person: Person): string
  /** A file's text, undefined when absent. */
  read(path: string): string | undefined
  /** Whether the assistant conversation is running a turn. */
  running(sessionId: string): boolean
  /** Whether a chat app is connected and switched on for this assistant. */
  chatConnected(person: Person): boolean
  /** Send a note into the assistant conversation. */
  sendNote(sessionId: string, text: string): void
  /** Send a held message to the chat app; false when it can no longer go out. */
  sendHeld(person: Person, text: string): boolean
  warn(message: string): void
  /** The folder of the state files. */
  directory: string
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u

const MINUTE_MS = 60_000

/** A tick can run a little early; a beat that is this close counts as due. */
const BEAT_TOLERANCE_MS = 5000

/** How long a given reminder is remembered after its event. */
const REMINDED_KEEP_MS = 86_400_000

/** Most wake-ups one assistant may have waiting. */
export const MAX_WAKES = 50

/** How many days ahead repeating items are looked at, beyond the lead time. */
const REPEAT_HORIZON_DAYS = 2

/** @returns the instant as "11/05 周四 14:30". */
function whenText(ms: number, zone: string): string {
  const at = local(ms, zone)
  return `${at.short} ${weekdayOf(at.iso)} ${at.time}`
}

/** What one note says. */
export interface NoteParts {
  readonly now: number
  readonly zone: string
  /** When the next heartbeat comes, or undefined when they are off. */
  readonly nextBeat: number | undefined
  /** Set for the daily brief: today's labels, empty when today is free. */
  readonly brief?: readonly string[] | undefined
  /** Reminders due now: "11/05 周四 14:30 · 日程 · 看牙医". */
  readonly reminders: readonly string[]
  readonly wakes: readonly WakeRequest[]
  /** Whether a chat app is connected. */
  readonly chat: boolean
  /** Whether quiet hours are on now, which only a wake-up the user asked for comes through. */
  readonly inQuiet: boolean
}

/**
 * The note that wakes an assistant. In English: only the model reads it.
 * @param parts - what is due.
 * @returns the system note.
 */
export function heartbeatText(parts: NoteParts): string {
  const { iso, time } = local(parts.now, parts.zone)
  const next = parts.nextBeat === undefined ? 'Heartbeats are off.' : `Next heartbeat around ${whenText(parts.nextBeat, parts.zone)}.`
  const lines = [`${SYSTEM_PREFIX} Heartbeat. Local time ${iso} ${weekdayOf(iso)} ${time} (${parts.zone}). ${next}`]
  const due = parts.brief !== undefined || parts.reminders.length > 0 || parts.wakes.length > 0
  if (parts.brief !== undefined) {
    if (parts.brief.length === 0) {
      lines.push('', 'Daily brief: nothing is planned for today. Say so in one short, warm sentence.')
    } else {
      lines.push('', 'Daily brief: their plans for today, in their local time. Remind them in one or two warm, plain sentences of what they have to do, the most pressing first, without listing every detail.', ...parts.brief.map(item => `- ${item}`))
    }
  }
  if (parts.reminders.length > 0) {
    lines.push('', 'Reminders due now. Tell them in one warm sentence; the time may be well ahead if quiet hours moved the reminder, so say when it is.', ...parts.reminders.map(item => `- ${item}`))
  }
  if (parts.wakes.length > 0) {
    lines.push('', 'You asked to be woken now:', ...parts.wakes.map(wake => `- ${wake.reason}`))
    if (parts.inQuiet) lines.push('They asked for this during their quiet hours, so it may reach them now.')
  }
  if (!due) {
    lines.push('', 'Nothing is due. Use this moment only if something really needs doing: a follow-up you promised, or signs in the schedule that they have moved to another time zone, which you record in the profile. Otherwise end this turn without any text at all.')
  }
  lines.push('', parts.chat
    ? 'What they must see goes out with `im_send`: text you merely write stays in the app, where they may not look. Then write the same words as your reply, so the app shows them too.'
    : 'Write what they must see as your reply; it stays in the app.')
  return lines.join('\n')
}

/** @returns a state read from anything, keeping only what is well formed. */
function readState(value: unknown): HeartbeatState {
  const record = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
  const number = (field: unknown): number | undefined => (typeof field === 'number' && Number.isFinite(field) ? field : undefined)
  const lastCheckedAt = number(record.lastCheckedAt)
  const lastBeatAt = number(record.lastBeatAt)
  const reminded = record.reminded !== null && typeof record.reminded === 'object' ? record.reminded as Record<string, number> : {}
  const wakes = (Array.isArray(record.wakes) ? record.wakes as WakeRequest[] : [])
    .filter(wake => typeof wake?.id === 'string' && typeof wake.at === 'number' && typeof wake.reason === 'string')
    .map(wake => ({ id: wake.id, at: wake.at, reason: wake.reason, throughQuiet: wake.throughQuiet === true }))
  const held = (Array.isArray(record.held) ? record.held as HeldMessage[] : [])
    .filter(message => typeof message?.text === 'string' && typeof message.at === 'number')
  return {
    ...(lastCheckedAt === undefined ? {} : { lastCheckedAt }),
    ...(lastBeatAt === undefined ? {} : { lastBeatAt }),
    ...(typeof record.briefDate === 'string' ? { briefDate: record.briefDate } : {}),
    reminded,
    wakes,
    held,
  }
}

/** @returns the moments an entry happens that a reminder could be due for. */
function eventsOf(entry: DdlEntry, now: number, zone: string, leadMinutes: number): number[] {
  if (entry.repeat === undefined) return entry.start === undefined ? [] : [entry.start]
  const { rule, time } = entry.repeat
  if (time === undefined) return []
  const today = Date.parse(`${local(now, zone).iso}T00:00Z`)
  const days = REPEAT_HORIZON_DAYS + Math.ceil(leadMinutes / 1440)
  const events: number[] = []
  for (let offset = 0; offset <= days; offset += 1) {
    const day = new Date(today + offset * 86_400_000).toISOString().slice(0, 10)
    if (repeatsOn(rule, day)) events.push(zonedToUtc(day, time, zone))
  }
  return events
}

/** @returns the key a given reminder is remembered by. */
function reminderKey(entry: DdlEntry, event: number): string {
  return `${entry.title}|${event}`
}

/** Decides, per assistant and per minute, whether to wake it. */
export class Heartbeat {
  private readonly states = new Map<string, HeartbeatState>()

  constructor(private readonly deps: HeartbeatDeps) {}

  private pathOf(personId: string): string {
    return join(this.deps.directory, `${folderName(personId)}.json`)
  }

  private stateOf(personId: string): HeartbeatState {
    const known = this.states.get(personId)
    if (known !== undefined) return known
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.pathOf(personId), 'utf8'))
    } catch {
      // No file yet, or one nobody can read: start over.
    }
    const state = readState(parsed)
    this.states.set(personId, state)
    return state
  }

  private save(personId: string): void {
    try {
      mkdirSync(this.deps.directory, { recursive: true })
      const target = this.pathOf(personId)
      const temporary = `${target}.tmp`
      writeFileSync(temporary, `${JSON.stringify(this.stateOf(personId), null, 2)}\n`)
      renameSync(temporary, target)
    } catch (error) {
      this.deps.warn(`could not store the heartbeat of ${personId}: ${String(error)}`)
    }
  }

  /** @returns the wake-ups an assistant has waiting, soonest first. */
  wakes(personId: string): readonly WakeRequest[] {
    return [...this.stateOf(personId).wakes].sort((a, b) => a.at - b.at)
  }

  /**
   * Add a wake-up.
   * @returns the new wake-up, or undefined when too many are waiting.
   */
  addWake(personId: string, wake: Omit<WakeRequest, 'id'>): WakeRequest | undefined {
    const state = this.stateOf(personId)
    if (state.wakes.length >= MAX_WAKES) return undefined
    const added = { id: randomUUID(), ...wake }
    state.wakes.push(added)
    this.save(personId)
    return added
  }

  /**
   * Remove the wake-ups whose reason contains the words.
   * @returns those removed.
   */
  cancelWakes(personId: string, match: string): WakeRequest[] {
    const state = this.stateOf(personId)
    const words = match.trim().toLowerCase()
    const removed = state.wakes.filter(wake => wake.reason.toLowerCase().includes(words))
    if (removed.length === 0) return []
    state.wakes = state.wakes.filter(wake => !removed.includes(wake))
    this.save(personId)
    return removed
  }

  /** Keep a chat message until quiet hours end. */
  hold(personId: string, text: string): void {
    this.stateOf(personId).held.push({ text, at: this.deps.now() })
    this.save(personId)
  }

  /** Forget a removed assistant. */
  forget(personId: string): void {
    this.states.delete(personId)
    try {
      rmSync(this.pathOf(personId), { force: true })
    } catch (error) {
      this.deps.warn(`could not remove the heartbeat of ${personId}: ${String(error)}`)
    }
  }

  /**
   * Check every assistant; call this once a minute.
   * @returns the session ids woken.
   */
  tick(): string[] {
    const woken: string[] = []
    for (const person of this.deps.people()) {
      if (person.sessionId === undefined || person.cwd === undefined) continue
      if (this.tickOne(person, person.sessionId, person.cwd)) woken.push(person.sessionId)
    }
    return woken
  }

  private tickOne(person: Person, sessionId: string, cwd: string): boolean {
    const now = this.deps.now()
    const settings = assistantSettings(person)
    const zone = this.deps.zoneFor(person)
    const state = this.stateOf(person.id)
    const today = local(now, zone)

    if (state.lastCheckedAt === undefined) {
      // A new assistant, or the first run of this version: nothing is owed for the time before it.
      state.lastCheckedAt = now
      state.lastBeatAt = now
      if (briefPassed(settings, today.time)) state.briefDate = today.iso
      this.save(person.id)
      return false
    }

    const quiet = quietSpanAt(settings, now, zone) !== undefined
    if (!quiet) this.flushHeld(person, state)
    if (this.deps.running(sessionId)) return false

    const wakes = state.wakes.filter(wake => wake.at <= now && (!quiet || wake.throughQuiet))
    if (quiet && wakes.length === 0) return false

    const file = quiet ? undefined : this.deps.read(join(cwd, CALENDAR_FILE))
    const entries = file === undefined ? [] : parseDdl(file)
    const brief = !quiet && briefPassed(settings, today.time) && state.briefDate !== today.iso
      ? todayItems(entries, new Date(now), zone)
      : undefined
    const reminders = quiet ? [] : this.dueReminders(entries, settings, state, now, zone)
    const beatDue = !quiet && settings.heartbeatMinutes > 0
      && now - (state.lastBeatAt ?? 0) >= settings.heartbeatMinutes * MINUTE_MS - BEAT_TOLERANCE_MS

    if (!quiet) state.lastCheckedAt = now
    const due = brief !== undefined || reminders.length > 0 || wakes.length > 0
    if (!due && !beatDue) {
      this.saveQuietly(person.id, state, now)
      return false
    }
    state.lastBeatAt = now
    if (!due && !settings.heartbeatIdleWake) {
      this.saveQuietly(person.id, state, now)
      return false
    }

    if (brief !== undefined) state.briefDate = today.iso
    for (const reminder of reminders) state.reminded[reminder.key] = reminder.event
    state.wakes = state.wakes.filter(wake => !wakes.includes(wake))
    this.saveQuietly(person.id, state, now)
    this.deps.sendNote(sessionId, heartbeatText({
      now,
      zone,
      nextBeat: this.nextBeat(settings, now, zone),
      brief,
      reminders: reminders.map(reminder => reminder.label),
      wakes,
      chat: this.deps.chatConnected(person),
      inQuiet: quiet,
    }))
    return true
  }

  /** Store the state, forgetting reminders of events long past. */
  private saveQuietly(personId: string, state: HeartbeatState, now: number): void {
    for (const [key, event] of Object.entries(state.reminded)) {
      if (event + REMINDED_KEEP_MS < now) delete state.reminded[key]
    }
    this.save(personId)
  }

  /** @returns when the next heartbeat will fire: after quiet hours when it falls inside them. */
  private nextBeat(settings: AssistantSettings, now: number, zone: string): number | undefined {
    if (settings.heartbeatMinutes <= 0) return undefined
    const next = now + settings.heartbeatMinutes * MINUTE_MS
    return quietSpanAt(settings, next, zone)?.end ?? next
  }

  /** @returns the reminders whose time has come since the last look. */
  private dueReminders(entries: readonly DdlEntry[], settings: AssistantSettings, state: HeartbeatState, now: number, zone: string): { key: string; event: number; label: string }[] {
    const from = state.lastCheckedAt as number
    const lead = settings.reminderLeadMinutes
    const due: { key: string; event: number; label: string }[] = []
    for (const entry of entries) {
      if (entry.done || isMuted(entry) || !hasClockTime(entry, zone)) continue
      for (const event of eventsOf(entry, now, zone, lead)) {
        const key = reminderKey(entry, event)
        if (event <= now || key in state.reminded) continue
        const at = remindAt(settings, event, lead, zone)
        if (at > from && at <= now) due.push({ key, event, label: `${whenText(event, zone)} · ${entry.kind} · ${entry.title}` })
      }
    }
    return due.sort((a, b) => a.event - b.event)
  }

  /** Send what waited for quiet hours to end; what can no longer go out is dropped with a log line. */
  private flushHeld(person: Person, state: HeartbeatState): void {
    if (state.held.length === 0) return
    for (const message of state.held) {
      let sent = false
      try {
        sent = this.deps.sendHeld(person, message.text)
      } catch (error) {
        this.deps.warn(`could not send a held message of ${person.name}: ${String(error)}`)
      }
      if (!sent) this.deps.warn(`a held message of ${person.name} could not go out and was dropped`)
    }
    state.held = []
    this.save(person.id)
  }
}

/** @returns whether today's brief time has come, when a brief is set at all. */
function briefPassed(settings: AssistantSettings, time: string): boolean {
  const target = settings.dailyBriefTime.trim()
  return TIME.test(target) && time >= target
}
