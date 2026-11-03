/**
 * dsh-assisstant settings row (top level, so the settings page can edit it).
 *
 * Owns every setting and the assistant list, and provides the `dshAssisstant`
 * service the preset's plugins read. It also:
 *
 * - hides the `dsh-assisstant` preset from every preset list;
 * - creates each new user's conversation (a session on the hidden
 *   preset in their folder) and writes it back into the assistant list;
 * - tells complete-subagent which models workers may run;
 * - titles each assistant conversation with its assistant's name;
 * - polls the RMB balance of the DeepSeek account;
 * - runs the page's WeChat requests against the im-robot sub-plugin and
 *   stores each binding state for the page to draw.
 * @module dsh-assisstant
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { COMPACT_RATIO_RANGE, DEFAULTS, DEFAULT_WORKER_MODELS, MAX_BALANCE_CHECK_MINUTES, PLUGIN_ID, PRESET_ID, WORKER_PRESET_ID, assistantSettings, readPeople, readWorkerModels, readWechatRequest, readWechatStates } from './shared/settings.ts'
import type { Person, WechatState, WorkerModel } from './shared/settings.ts'
import { queryBalance } from './host/balance.ts'
import type { BalanceState } from './host/balance.ts'
import { DailyBrief } from './host/brief.ts'
import { processZone, zoneProjection } from './host/calendar.ts'
import type { ZoneState } from './host/calendar.ts'
import { hidePreset } from './host/hide-preset.ts'
import { greetingText, mergePeople, needingSessions, removedPeople } from './host/people.ts'
import { presetOf } from './host/compat.ts'
import { SettingsWriter, guarded, outsideTransactions, sendHostNote } from './host/service.ts'
import { TitlePin } from './host/title.ts'
import type { AssistantService, SharedSettings, InputChannel } from './host/service.ts'
import type {
  AgentLike,
  AgentPresetsLike,
  AgentsLike,
  CompleteSubagentLike,
  CredentialsLike,
  DeepseekAccountLike,
  ImBindingStatus,
  ImRobotLike,
  SessionControllerLike,
  SessionLike,
  ProjectionHandleLike,
  SessionProjectionsLike,
  SessionTitleLike,
  SettingsLike,
} from './host/types.ts'
import { WechatLink } from './host/wechat-link.ts'
import { Watchdog } from './host/watchdog.ts'

export type { AssistantService, SharedSettings, InputChannel } from './host/service.ts'

export const name = PLUGIN_ID
export const inject = ['agents']

export interface Config {
  compactRatio: Volatile<number>
  workerModels: Volatile<WorkerModel[]>
  balanceThreshold: Volatile<number>
  balanceCheckMinutes: Volatile<number>
  balanceReminder: Volatile<string>
  personaSelfCorrect: Volatile<boolean>
  personaCooldownHours: Volatile<number>
  personaMaxChars: Volatile<number>
  profileMaxChars: Volatile<number>
  people: Volatile<unknown[]>
  wechatRequest: Volatile<unknown>
  wechatState: Volatile<Record<string, unknown>>
}

export const Config: z<Config> = z.object({
  compactRatio: z.number().min(COMPACT_RATIO_RANGE.min).max(COMPACT_RATIO_RANGE.max).default(DEFAULTS.compactRatio)
    .description('Compact a conversation once its context reaches this share of the window').volatile(),
  workerModels: z.array(z.object({ provider: z.string().required(), model: z.string().required() })).default([...DEFAULT_WORKER_MODELS])
    .description('The models background workers may run; the assistant conversation picks one per task').volatile(),
  balanceThreshold: z.number().min(0).default(DEFAULTS.balanceThreshold)
    .description('Remind about recharging below this many yuan').volatile(),
  balanceCheckMinutes: z.natural().min(1).default(DEFAULTS.balanceCheckMinutes)
    .description('Minutes between balance checks').volatile(),
  balanceReminder: z.string().default(DEFAULTS.balanceReminder)
    .description('Reminder wording; {balance} and {threshold} are filled in').volatile(),
  personaSelfCorrect: z.boolean().default(DEFAULTS.personaSelfCorrect)
    .description('Let the assistant adjust its persona to each user').volatile(),
  personaCooldownHours: z.natural().default(DEFAULTS.personaCooldownHours)
    .description('Hours between two persona changes').volatile(),
  personaMaxChars: z.natural().min(200).default(DEFAULTS.personaMaxChars)
    .description('Longest persona.md the assistant keeps').volatile(),
  profileMaxChars: z.natural().min(500).default(DEFAULTS.profileMaxChars)
    .description('Longest profile.md the assistant keeps').volatile(),
  people: z.array(z.any()).default([]).description('The assistant list (managed by the assistant page)').volatile(),
  wechatRequest: z.any().description('The assistant page\'s latest WeChat request').volatile(),
  wechatState: z.dict(z.any()).default({}).description('WeChat binding states (written by the host)').volatile(),
}) as unknown as z<Config>

/** The services this plugin reads, beyond what cordis types. */
interface HostContext {
  get(name: 'agents'): AgentsLike
  get(name: 'agentPresets'): AgentPresetsLike | undefined
  get(name: 'sessionController'): SessionControllerLike | undefined
  get(name: 'settings'): SettingsLike | undefined
  get(name: 'credentials'): CredentialsLike | undefined
  get(name: 'deepseekAccount'): DeepseekAccountLike | undefined
  get(name: 'imRobot'): ImRobotLike | undefined
  get(name: 'completeSubagent'): CompleteSubagentLike | undefined
  get(name: 'sessionProjections'): SessionProjectionsLike | undefined
  get(name: 'sessionTitle'): SessionTitleLike | undefined
  get(name: 'hmr'): unknown
  on(name: string, listener: (...args: never[]) => unknown): () => void
}

/** A live config value, or undefined when `apply` was called without the loader. */
function live(value: { get(): unknown } | undefined): unknown {
  return value?.get()
}

/** @returns a finite number within bounds, else the fallback. */
function numberOr(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

/** @returns a non-empty string, else the fallback. */
function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

/** @returns a boolean, else the fallback. */
function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Read the user-facing settings with defaults for anything missing.
 * @param config - the loaded config.
 * @returns plain values.
 */
export function readSettings(config: Partial<Config> | undefined): SharedSettings {
  return {
    compactRatio: numberOr(live(config?.compactRatio), DEFAULTS.compactRatio, COMPACT_RATIO_RANGE.min, COMPACT_RATIO_RANGE.max),
    workerModels: readWorkerModels(live(config?.workerModels)),
    balanceThreshold: numberOr(live(config?.balanceThreshold), DEFAULTS.balanceThreshold, 0),
    balanceCheckMinutes: numberOr(live(config?.balanceCheckMinutes), DEFAULTS.balanceCheckMinutes, 1, MAX_BALANCE_CHECK_MINUTES),
    balanceReminder: stringOr(live(config?.balanceReminder), DEFAULTS.balanceReminder),
    personaSelfCorrect: booleanOr(live(config?.personaSelfCorrect), DEFAULTS.personaSelfCorrect),
    personaCooldownHours: numberOr(live(config?.personaCooldownHours), DEFAULTS.personaCooldownHours, 0),
    personaMaxChars: numberOr(live(config?.personaMaxChars), DEFAULTS.personaMaxChars, 200),
    profileMaxChars: numberOr(live(config?.profileMaxChars), DEFAULTS.profileMaxChars, 500),
  }
}

/** @returns this plugin's data folder under the DSH home. */
export function dataDirectory(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'plugin-data', PLUGIN_ID)
}

/**
 * Wire the settings row.
 * @param ctx - the plugin context.
 * @param config - the loaded config.
 */
export function apply(ctx: Context, config: Config): void {
  const host = ctx as unknown as HostContext
  const warn = (message: string): void => { ctx.logger.warn(message) }
  /** Run work nobody awaits; what it rejects with is logged, never unhandled. */
  const background = (label: string, work: () => unknown): void => { guarded(warn, label, work)() }
  const settings = (): SharedSettings => readSettings(config)
  const storedPeople = (): Person[] => readPeople(live(config?.people))
  const writer = new SettingsWriter(() => host.get('settings'), PLUGIN_ID, warn, run => outsideTransactions(host.get('hmr'))(run))

  let people = storedPeople()
  let balance: BalanceState = { status: 'unknown', checkedAt: 0 }
  const inputs = new Map<string, InputChannel>()
  let zones: ProjectionHandleLike<ZoneState> | undefined
  ctx.inject(['sessionProjections'], (scope) => {
    const projections = (scope as unknown as { sessionProjections: SessionProjectionsLike }).sessionProjections
    void Promise.resolve(projections.register<ZoneState>(zoneProjection))
      .then((handle) => { zones = handle }, (error: unknown) => { warn(`the time-zone projection could not be registered: ${String(error)}`) })
  })

  const refreshBalance = async (): Promise<BalanceState> => {
    balance = await queryBalance({
      account: host.get('deepseekAccount'),
      credentials: host.get('credentials'),
    })
    return balance
  }

  const service: AssistantService = {
    settings,
    people: () => people,
    personForSession: sessionId => people.find(person => person.sessionId === sessionId),
    balance: () => balance,
    refreshBalance,
    lastInput: sessionId => inputs.get(sessionId) ?? 'web',
    markInput: (sessionId, channel) => { inputs.set(sessionId, channel) },
    zoneFor: (session) => {
      try {
        return (session === undefined ? undefined : zones?.stateOf(session)?.timeZone) ?? processZone()
      } catch {
        return processZone()
      }
    },
  }
  ctx.provide('dshAssisstant', service)

  ctx.inject(['agentPresets'], (scope) => {
    const restore = hidePreset((scope as unknown as { agentPresets: AgentPresetsLike }).agentPresets, [PRESET_ID, WORKER_PRESET_ID])
    if (restore === undefined) warn('the preset registry has no list() to wrap, so the user preset stays visible in the preset pickers')
    else scope.effect(() => restore)
  })

  const presetOfSession = (session: SessionLike): string | undefined =>
    presetOf({ agentPresets: host.get('agentPresets'), sessionProjections: host.get('sessionProjections') }, session)

  // ---- the models ----
  const pushWorkerModels = (): void => {
    host.get('completeSubagent')?.setChildModels(settings().workerModels)
  }
  ctx.inject(['completeSubagent'], () => { pushWorkerModels() })

  // ---- the conversation's title: its assistant's name ----
  const titles = new TitlePin({
    titles: () => host.get('sessionTitle'),
    nameOf: sessionId => service.personForSession(sessionId)?.name,
    warn,
  })
  const assistantRoot = (session: SessionLike): boolean =>
    session.header.parentSession === undefined && presetOfSession(session) === PRESET_ID
  const retitle = (): void => {
    for (const agent of host.get('agents').list()) {
      if (assistantRoot(agent.session)) titles.apply(agent.session)
    }
  }
  host.on('agent/created', guarded(warn, 'title', ({ agent }: { agent: AgentLike }) => {
    if (assistantRoot(agent.session)) queueMicrotask(() => { titles.apply(agent.session) })
  }) as never)

  // ---- the assistant list ----
  const creating = new Set<string>()
  const reconcile = async (): Promise<void> => {
    const controller = host.get('sessionController')
    if (controller === undefined) return
    for (const person of needingSessions(people)) {
      if (creating.has(person.id)) continue
      creating.add(person.id)
      try {
        const { sessionId } = await controller.create({ cwd: person.cwd, agentPreset: PRESET_ID })
        await writer.write(() => {
          const merged = mergePeople(storedPeople(), new Map([[person.id, { sessionId }]]))
          return merged === undefined ? undefined : { people: merged }
        })
        note(sessionId, greetingText())
      } catch (error) {
        warn(`could not create the conversation for ${person.name}: ${String(error)}`)
      } finally {
        creating.delete(person.id)
      }
    }
  }

  // ---- WeChat ----
  const writeState = (personId: string, state: WechatState | null): Promise<void> => writer.write(() => {
    const states = { ...readWechatStates(live(config?.wechatState)) }
    if (state === null) {
      if (!(personId in states)) return undefined
      delete states[personId]
    } else {
      states[personId] = state
    }
    return { wechatState: states }
  })
  const link = new WechatLink({
    robot: () => host.get('imRobot'),
    people: () => people,
    writeState,
    readState: personId => readWechatStates(live(config?.wechatState))[personId],
    warn,
  })
  link.seen(readWechatRequest(live(config?.wechatRequest)))
  ctx.effect(() => () => link.dispose())
  /** Give each bound account its assistant's options; an account not logged in has none to change. */
  const pushRobotOptions = (): void => {
    const robot = host.get('imRobot')
    const states = readWechatStates(live(config?.wechatState))
    for (const person of people) {
      if (states[person.id]?.status !== 'bound') continue
      const { wechatEnabled, wechatReplyMaxChars } = assistantSettings(person)
      background('WeChat options', () => robot?.setBindingOptions?.(person.id, { enabled: wechatEnabled, replyMaxChars: wechatReplyMaxChars }))
    }
  }
  ctx.inject(['imRobot'], () => { pushRobotOptions() })
  host.on('im-robot/inbound', guarded(warn, 'WeChat input', (sessionId: string) => { service.markInput(sessionId, 'wechat') }) as never)
  host.on('im-robot/status', guarded(warn, 'WeChat status', (bindingId: string, status: ImBindingStatus) => link.syncStatus(bindingId, status)) as never)

  // A QR code or a scan in progress cannot survive a restart.
  background('QR code expiry', () => writer.write(() => {
    const states = readWechatStates(live(config?.wechatState))
    let changed = false
    for (const [personId, state] of Object.entries(states)) {
      if (state.status !== 'qr' && state.status !== 'scanned') continue
      states[personId] = { status: 'expired', reason: '二维码已过期，请重新绑定。', updatedAt: Date.now() }
      changed = true
    }
    return changed ? { wechatState: states } : undefined
  }))

  // ---- system notes, the watchdog, and the daily brief ----
  const note = (sessionId: string, text: string): void => {
    const controller = host.get('sessionController')
    if (controller === undefined) return
    sendHostNote(controller, sessionId, text).catch((error: unknown) => { warn(`could not send a system note to ${sessionId}: ${String(error)}`) })
  }
  const watchdog = new Watchdog({
    now: Date.now,
    stallMs: router => assistantSettings(service.personForSession(router)).watchdogStallMinutes * 60_000,
    cancel: (sessionId) => {
      try {
        host.get('sessionController')?.cancel({ sessionId })
      } catch (error) {
        warn(`the watchdog could not stop ${sessionId}: ${String(error)}`)
      }
    },
    notify: note,
  })
  host.on('session/event', guarded(warn, 'session event', (session: SessionLike, event: { type: string }) => {
    const preset = presetOfSession(session)
    if (preset === PRESET_ID) watchdog.observe(session.id, 'router', session.id, event.type)
    else if (preset === WORKER_PRESET_ID) {
      const parent = session.header.parentSession
      watchdog.observe(session.id, 'worker', parent === undefined ? session.id : watchdog.routerOf(parent), event.type)
    }
    if (preset === PRESET_ID && event.type === 'session/title' && session.header.parentSession === undefined) {
      titles.observe(session, (event as { data?: { title?: string; source?: { kind?: string } } }).data)
    }
    if (preset === PRESET_ID && event.type === 'user/message') {
      const source = (event as { data?: { source?: { clientTimeZone?: unknown } } }).data?.source
      if (typeof source?.clientTimeZone === 'string') service.markInput(session.id, 'web')
    }
  }) as never)
  const brief = new DailyBrief({
    now: () => new Date(),
    time: person => assistantSettings(person).dailyBriefTime,
    people: () => people,
    zoneFor: person => service.zoneFor(person.sessionId === undefined ? undefined : host.get('agents').get(person.sessionId)?.session),
    read: (path) => {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return undefined
      }
    },
    send: note,
    statePath: join(dataDirectory(), 'brief.json'),
  })
  const minute = setInterval(guarded(warn, 'minute timer', () => {
    watchdog.tick()
    brief.tick()
  }), 60_000)
  minute.unref?.()
  ctx.effect(() => () => clearInterval(minute))

  // ---- the balance ----
  let timer: ReturnType<typeof setInterval> | undefined
  let minutes = 0
  const schedule = (): void => {
    const next = settings().balanceCheckMinutes
    if (next === minutes && timer !== undefined) return
    minutes = next
    if (timer !== undefined) clearInterval(timer)
    timer = setInterval(guarded(warn, 'balance timer', refreshBalance), minutes * 60_000)
    timer.unref?.()
  }
  ctx.effect(() => () => { if (timer !== undefined) clearInterval(timer) })
  schedule()
  ctx.inject(['deepseekAccount'], () => { background('balance', refreshBalance) })
  background('balance', refreshBalance)

  // ---- reacting to settings changes ----
  host.on('loader/volatile-update', guarded(warn, 'settings update', () => {
    const next = storedPeople()
    for (const person of removedPeople(people, next)) {
      background('WeChat unbinding', () => link.forget(person.id))
      if (person.sessionId !== undefined) watchdog.forget(person.sessionId)
    }
    const moved = next.filter(person => assistantSettings(person).sandboxMode !== assistantSettings(people.find(entry => entry.id === person.id)).sandboxMode)
    people = next
    for (const person of moved) {
      const session = person.sessionId === undefined ? undefined : host.get('agents').get(person.sessionId)?.session
      session?.append('sandbox/mode', { mode: assistantSettings(person).sandboxMode })
    }
    pushWorkerModels()
    retitle()
    background('assistant list', reconcile)
    background('WeChat request', () => link.handle(readWechatRequest(live(config?.wechatRequest))))
    pushRobotOptions()
    schedule()
  }) as never)
  ctx.inject(['sessionController', 'settings'], () => { background('assistant list', reconcile) })
}
