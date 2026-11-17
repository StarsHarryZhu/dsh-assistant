/**
 * The assistant conversation's tools beyond its records: choosing whether a
 * turn's reply reaches the user's chat app, waking itself later, quiet hours,
 * the daily brief's time, and copying what came in from a chat out of the
 * inbox. They register in the router preset's scope only, so no other session
 * sees them, and return plain text for the model.
 * @module dsh-assisstant/host/assistant-tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Person } from '../shared/settings.ts'
import { assistantSettings } from '../shared/settings.ts'
import { recordToolTitle } from '../shared/record-tools.ts'
import { offPeakFrom } from '../shared/peak.ts'
import { local, zonedToUtc } from './calendar.ts'
import { INBOX_FOLDER, copyFromInbox } from './inbox.ts'
import { MAX_OUTBOUND_FILES, outboundFiles, workspaceName } from './outbound.ts'
import { inDailyQuiet, quietSpanAt } from './quiet.ts'
import { invalidTiming } from './records/calendar.ts'
import { card } from './records/tools.ts'
import type { AssistantService } from './service.ts'
import type { AgentLike } from './types.ts'

/** The furthest ahead a wake-up may be, in minutes. */
const MAX_WAKE_MINUTES = 30 * 24 * 60

const MINUTE_MS = 60_000

/** The result shape every assistant tool shares: whether it worked, and plain text for the model. */
export const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean', required: true },
      message: { type: 'string', required: true },
    },
  },
  render: (_args: unknown, value: { message: string }) => [{ type: 'text' as const, text: value.message }],
} as const

/** How a reply bound for the chat app is written. */
const CHAT_FORMAT = 'Write it as a short chat message in plain text, without Markdown; wrap a list or steps that must stay in one message in <keep> and </keep>.'

const DATE_HINT = 'YYYY-MM-DD, their local date'
const TIME_HINT = 'HH:MM, 24-hour, their local time'

/** A tool's result. */
interface Outcome {
  ok: boolean
  message: string
}

/** What the tools need from the policy. */
export interface AssistantToolDeps {
  readonly service: AssistantService
  /** The assistant a call acts for. */
  person(agent: AgentLike | undefined): Person | undefined
  /** The user's IANA zone. */
  zone(agent: AgentLike | undefined): string
  now?(): number
}

/** What a wake-up is asked for with. */
interface WakeArgs {
  readonly reason: string
  readonly minutes?: number | undefined
  readonly date?: string | undefined
  readonly time?: string | undefined
  readonly through_quiet?: boolean | undefined
  readonly off_peak?: boolean | undefined
}

/** @returns the instant a wake-up asks for, or why it cannot be used. */
function wakeTime(args: Pick<WakeArgs, 'minutes' | 'date' | 'time'>, now: number, zone: string): number | string {
  if (args.minutes !== undefined) {
    if (!Number.isInteger(args.minutes) || args.minutes < 1) return 'minutes must be a whole number of at least 1.'
    if (args.minutes > MAX_WAKE_MINUTES) return 'A wake-up can be at most 30 days ahead. Longer plans belong in the schedule.'
    return now + args.minutes * MINUTE_MS
  }
  if (args.time === undefined) return 'Give minutes, or a time with an optional date.'
  const invalid = invalidTiming({ date: args.date, time: args.time })
  if (invalid !== undefined) return invalid
  const at = zonedToUtc(args.date ?? local(now, zone).iso, args.time, zone)
  if (at <= now) return 'That time has already passed.'
  if (at > now + MAX_WAKE_MINUTES * MINUTE_MS) return 'A wake-up can be at most 30 days ahead. Longer plans belong in the schedule.'
  return at
}

/** @returns "11/05 14:40". */
function shortTime(ms: number, zone: string): string {
  const at = local(ms, zone)
  return `${at.short} ${at.time}`
}

/**
 * Build the router's tools.
 * @param deps - the service and how to read a call's assistant.
 * @returns tool definitions to register in the preset's scope.
 */
export function assistantTools(deps: AssistantToolDeps): unknown[] {
  const clock = (): number => (deps.now ?? Date.now)()
  const run = async (exec: { agent?: unknown }, body: (person: Person, agent: AgentLike, now: number) => Outcome | Promise<Outcome>): Promise<Outcome> => {
    const agent = exec.agent as AgentLike | undefined
    const person = deps.person(agent)
    if (person === undefined || agent === undefined) return { ok: false, message: 'This conversation has no assistant, so nothing was done.' }
    try {
      return await body(person, agent, clock())
    } catch (error) {
      return { ok: false, message: `It did not work: ${String(error)}` }
    }
  }


  /** A wake-up for work that waits for DeepSeek's off-peak hours. */
  const wakeOffPeak = (person: Person, now: number, zone: string, args: WakeArgs): Outcome => {
    const windows = deps.service.peakWindows()
    if (windows === undefined) return { ok: false, message: 'Waiting for off-peak hours is switched off in the settings: do it now.' }
    if (args.through_quiet === true) return { ok: false, message: 'off_peak and through_quiet do not go together: off_peak is for work that can wait.' }
    const asked = args.minutes !== undefined || args.time !== undefined
    const from = asked ? wakeTime(args, now, zone) : now
    if (typeof from === 'string') return { ok: false, message: from }
    const at = offPeakFrom(windows, from)
    if (!asked && at === now) return { ok: false, message: 'It is off-peak now: do it now instead of waiting.' }
    const added = deps.service.addWake(person, { at, reason: args.reason.trim(), throughQuiet: false, offPeak: true })
    if (added === undefined) return { ok: false, message: 'Too many wake-ups are waiting. Cancel some first.' }
    const span = quietSpanAt(assistantSettings(person), at, zone)
    return {
      ok: true,
      message: span === undefined
        ? `You will be woken at ${shortTime(at, zone)}${at === from ? '' : ', when DeepSeek\'s peak hours end'}.`
        : `The end of the peak hours falls in quiet hours, so you will be woken when they end, at ${shortTime(span.end, zone)}, or after the next peak hours if one is on then.`,
    }
  }

  return [
    defineTool({
      name: 'im_route',
      description: 'Choose whether your final reply in this turn also goes to the user\'s chat app (WeChat), and send files from the workspace with it. By default the reply goes there only when a message from that app started the turn; '
        + 'call this with send true for anything else they must see (a reminder, the daily brief, a worker\'s result, a question, a file), or with send false to keep a reply to a chat message in the app only. '
        + 'Then write the reply as usual: the same text shows in the app.',
      parameters: {
        send: { type: 'boolean', required: true, description: 'true: the reply goes to the chat app too (in quiet hours it waits for their end, unless the user is talking to you or asked for this moment). false: it stays in the app only.' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: `Only with send true: up to ${MAX_OUTBOUND_FILES} files in the workspace to send after the reply, by their path in the workspace. `
            + 'Pictures (png, jpg, gif, webp, bmp) show as pictures, mp4 and mov as videos, anything else as a file to open; at most 100 MB each. Voice messages cannot be sent.',
        },
      },
      output: OUTPUT,
      presentCall: args => card(recordToolTitle('im_route', args)),
      execute: (args, exec) => run(exec, (person, agent) => {
        const files = args.files ?? []
        if (files.length > 0 && !args.send) return { ok: false, message: 'Files go only with send true. Nothing was routed.' }
        let paths: readonly string[] = []
        if (files.length > 0) {
          if (person.cwd === undefined) return { ok: false, message: 'This assistant has no workspace, so no file can be sent.' }
          const checked = outboundFiles(person.cwd, files)
          if (!checked.ok) return { ok: false, message: `${checked.message} Nothing was routed; call again with the files that can go.` }
          paths = checked.paths
        }
        const outcome = deps.service.routeChat(person, agent.session.id, args.send, paths)
        const named = paths.length === 0 ? '' : ` Then ${paths.map(path => workspaceName(person.cwd!, path)).join(', ')} ${paths.length === 1 ? 'goes' : 'go'} after it, one message each; do not repeat their paths in the reply.`
        switch (outcome.status) {
          case 'unavailable':
            return { ok: false, message: `No chat app is connected, so your reply stays in the app${paths.length === 0 ? '' : ' and no file was sent'}. Write it as usual.` }
          case 'no-turn':
            return { ok: false, message: 'No turn of this conversation is running, so nothing was routed.' }
          case 'kept':
            return { ok: true, message: 'Your final reply in this turn stays in the app only.' }
          case 'held':
            return { ok: true, message: `It is quiet hours: your final reply shows in the app now and goes to WeChat by itself at ${shortTime(outcome.until, deps.zone(agent))}.${named} ${CHAT_FORMAT}` }
          default:
            return { ok: true, message: `Your final reply in this turn goes to WeChat too.${named} ${CHAT_FORMAT}` }
        }
      }),
    }),
    defineTool({
      name: 'wake_after',
      description: 'Wake yourself later, for something with no place in the schedule: "call me in ten minutes", checking back on something, or work that can wait for DeepSeek\'s off-peak hours (off_peak). Things with a time belong in the schedule, which wakes you by itself.',
      parameters: {
        reason: { type: 'string', required: true, description: 'What to do then, in a few words. You read this when you wake.' },
        off_peak: { type: 'boolean', description: 'true for work that can wait: you are woken once DeepSeek\'s peak hours are over (when they end, without minutes or time; else at the first off-peak moment from then on).' },
        minutes: { type: 'integer', description: 'How many minutes from now.' },
        date: { type: 'string', description: `The date, ${DATE_HINT}, when not today. Use with time, instead of minutes.` },
        time: { type: 'string', description: `The time, ${TIME_HINT}. Use instead of minutes.` },
        through_quiet: { type: 'boolean', description: 'true only when the user asked to be alerted at exactly this moment inside their quiet hours ("wake me at 3 for my flight").' },
      },
      output: OUTPUT,
      presentCall: args => card(recordToolTitle('wake_after', args)),
      execute: (args, exec) => run(exec, (person, agent, now) => {
        if (args.reason.trim() === '') return { ok: false, message: 'A wake-up needs a reason.' }
        const zone = deps.zone(agent)
        if (args.off_peak === true) return wakeOffPeak(person, now, zone, args)
        const at = wakeTime(args, now, zone)
        if (typeof at === 'string') return { ok: false, message: at }
        const throughQuiet = args.through_quiet === true
        if (throughQuiet && !deps.service.turnFromUser(agent.session.id)) {
          return { ok: false, message: 'through_quiet is only for a moment the user asks for, and no message of theirs is in this turn. Leave it out.' }
        }
        const added = deps.service.addWake(person, { at, reason: args.reason.trim(), throughQuiet })
        if (added === undefined) return { ok: false, message: 'Too many wake-ups are waiting. Cancel some first.' }
        const span = throughQuiet ? undefined : quietSpanAt(assistantSettings(person), at, zone)
        return {
          ok: true,
          message: span === undefined
            ? `You will be woken at ${shortTime(at, zone)}.`
            : `That falls in quiet hours, so you will be woken when they end, at ${shortTime(span.end, zone)}.`,
        }
      }),
    }),
    defineTool({
      name: 'wake_cancel',
      description: 'Cancel wake-ups you set, found by words in their reason.',
      parameters: {
        match: { type: 'string', required: true, description: 'Words from the reason.' },
      },
      output: OUTPUT,
      presentCall: args => card(recordToolTitle('wake_cancel', args)),
      execute: (args, exec) => run(exec, (person) => {
        if (args.match.trim() === '') return { ok: false, message: 'Say which wake-up.' }
        const removed = deps.service.cancelWakes(person, args.match)
        return removed.length === 0
          ? { ok: false, message: `No wake-up mentions "${args.match}".` }
          : { ok: true, message: `Cancelled: ${removed.map(wake => wake.reason).join('; ')}.` }
      }),
    }),
    defineTool({
      name: 'quiet_set',
      description: 'Change quiet hours, only because the user asked for it in this turn: never because of an event, a task, a report, or your own judgment. '
        + 'Daily hours repeat every day; temporary hours are for now or one stretch ("no messages until 10 tomorrow"), on top of the daily ones.',
      parameters: {
        daily_start: { type: 'string', description: `New start of the daily hours, ${TIME_HINT}. With daily_end. Both empty turn them off.` },
        daily_end: { type: 'string', description: `New end of the daily hours, ${TIME_HINT}.` },
        until_date: { type: 'string', description: `Temporary hours: the last date, ${DATE_HINT}; today when omitted.` },
        until_time: { type: 'string', description: `Temporary hours: when they end, ${TIME_HINT}.` },
        from_date: { type: 'string', description: `Temporary hours: the first date, ${DATE_HINT}, when not starting now.` },
        from_time: { type: 'string', description: `Temporary hours: when they start, ${TIME_HINT}, when not starting now.` },
        clear_temporary: { type: 'boolean', description: 'true ends the temporary hours.' },
      },
      output: OUTPUT,
      presentCall: args => card(recordToolTitle('quiet_set', args)),
      execute: (args, exec) => run(exec, async (person, agent, now) => {
        if (!deps.service.turnFromUser(agent.session.id)) {
          return { ok: false, message: 'Quiet hours change only when the user asks, and no message of theirs is in this turn, so nothing changed.' }
        }
        const zone = deps.zone(agent)
        const patch: Record<string, unknown> = {}
        const said: string[] = []
        if (args.daily_start !== undefined || args.daily_end !== undefined) {
          const start = args.daily_start ?? ''
          const end = args.daily_end ?? ''
          if (start === '' && end === '') {
            said.push('Daily quiet hours are off.')
          } else {
            const invalid = invalidTiming({ time: start, endTime: end })
            if (invalid !== undefined) return { ok: false, message: invalid }
            if (start === end) return { ok: false, message: 'The start and the end are the same. Both empty turn daily quiet hours off.' }
            said.push(`Daily quiet hours are ${start}–${end}.`)
          }
          patch.quietStart = start
          patch.quietEnd = end
        }
        if (args.clear_temporary === true) {
          patch.tempQuietFrom = undefined
          patch.tempQuietUntil = undefined
          said.push('Temporary quiet hours are off.')
        } else if (args.until_time !== undefined) {
          const invalid = invalidTiming({ date: args.until_date, time: args.until_time, endDate: args.from_date, endTime: args.from_time })
          if (invalid !== undefined) return { ok: false, message: invalid }
          const until = zonedToUtc(args.until_date ?? local(now, zone).iso, args.until_time, zone)
          const from = args.from_time === undefined ? now : zonedToUtc(args.from_date ?? local(now, zone).iso, args.from_time, zone)
          if (until <= now) return { ok: false, message: 'That end has already passed. Check the date.' }
          if (until <= from) return { ok: false, message: 'The end is before the start.' }
          patch.tempQuietFrom = from
          patch.tempQuietUntil = until
          said.push(`Temporary quiet hours run ${from <= now ? 'from now' : `from ${shortTime(from, zone)}`} until ${shortTime(until, zone)}.`)
        }
        if (Object.keys(patch).length === 0) return { ok: false, message: 'Nothing to change: give daily_start and daily_end, until_time, or clear_temporary.' }
        await deps.service.updateSettings(person.id, patch)
        return { ok: true, message: said.join(' ') }
      }),
    }),
    defineTool({
      name: 'brief_set',
      description: 'Change when the daily brief comes, or turn it off, only because the user asked for it in this turn: never because of an event, a task, or your own judgment.',
      parameters: {
        time: { type: 'string', required: true, description: `The new time, ${TIME_HINT}. Empty turns the daily brief off.` },
      },
      output: OUTPUT,
      presentCall: args => card(recordToolTitle('brief_set', args)),
      execute: (args, exec) => run(exec, async (person, agent) => {
        if (!deps.service.turnFromUser(agent.session.id)) {
          return { ok: false, message: 'The daily brief changes only when the user asks, and no message of theirs is in this turn, so nothing changed.' }
        }
        const time = args.time.trim()
        if (time === '') {
          await deps.service.updateSettings(person.id, { dailyBriefTime: '' })
          return { ok: true, message: 'The daily brief is off.' }
        }
        const invalid = invalidTiming({ time })
        if (invalid !== undefined) return { ok: false, message: invalid }
        await deps.service.updateSettings(person.id, { dailyBriefTime: time })
        const settings = assistantSettings(person)
        return {
          ok: true,
          message: inDailyQuiet(settings, time)
            ? `The daily brief is set to ${time}, but that is inside the daily quiet hours (${settings.quietStart}–${settings.quietEnd}), so it will come at ${settings.quietEnd}. Tell them, and change quiet hours only if they say so.`
            : `The daily brief comes at ${time} from now on.`,
        }
      }),
    }),
    defineTool({
      name: 'media_copy',
      description: `Copy a file the user sent from a chat app out of ${INBOX_FOLDER}/ into a folder of the workspace, before you or a worker use it. Files in ${INBOX_FOLDER}/ are removed after some days, so nobody works on them there.`,
      parameters: {
        file: { type: 'string', required: true, description: 'The file: the path their message gave, or its name in the WeChat inbox.' },
        to: { type: 'string', required: true, description: 'The folder, relative to the workspace, such as projects/装修 or files. Created when missing; never inside the inbox.' },
      },
      output: OUTPUT,
      presentCall: args => card(recordToolTitle('media_copy', args)),
      execute: (args, exec) => run(exec, (person) => {
        if (person.cwd === undefined) return { ok: false, message: 'This assistant has no workspace.' }
        return copyFromInbox(person.cwd, args.file, args.to)
      }),
    }),
  ]
}
