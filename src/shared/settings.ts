/**
 * Identities, defaults, and the data shapes both halves read from the settings
 * row: the assistant list, WeChat binding requests, and WeChat binding states.
 * The settings row is also the channel between the halves (the page writes a
 * request, the host writes the outcome back), so every reader here accepts
 * anything and keeps only well-formed entries.
 * @module dsh-assisstant/shared/settings
 */

/** The npm package name: the browser bundle's registration id and the Plugins page key for this bundle. */
export const PACKAGE_NAME = '@starsharryzhu/dsh-assistant'

/**
 * This plugin's internal id: the settings namespace (the profile row's id),
 * the browser half's locale key, and its data folder. It keeps the package's
 * original spelling so settings, presets, and data written by earlier local
 * installs stay where they are after the package was renamed.
 */
export const PLUGIN_ID = 'dsh-assisstant'

/** The hidden router preset: each user's own conversation. */
export const PRESET_ID = 'dsh-assisstant'

/** The hidden worker preset every `delegate` child of an assistant conversation runs on. */
export const WORKER_PRESET_ID = 'dsh-assisstant-worker'

/** The left-sidebar row and main panel id. */
export const PANEL_ID = 'dsh-assisstant'

/** Default values of the settings every assistant shares (the Plugins page). */
export const DEFAULTS = {
  compactRatio: 0.5,
  balanceThreshold: 10,
  balanceCheckMinutes: 120,
  balanceReminder: '温馨提示：账户余额只剩 {balance} 元了（低于 {threshold} 元）。',
  personaSelfCorrect: true,
  personaCooldownHours: 24,
  personaMaxChars: 2000,
  profileMaxChars: 6000,
} as const

/** One model workers may run. */
export interface WorkerModel {
  readonly provider: string
  readonly model: string
}

/** The models workers may run until the user chooses others. */
export const DEFAULT_WORKER_MODELS: readonly WorkerModel[] = [{ provider: 'deepseek-account', model: 'deepseek-flash' }]

/** Default values of the settings each assistant has for itself (its settings tab). */
/** What an assistant's workers may change, in the host's sandbox modes. */
export const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'] as const

/** One of `SANDBOX_MODES`. */
export type SandboxMode = typeof SANDBOX_MODES[number]

export const ASSISTANT_DEFAULTS = {
  sandboxMode: 'workspace-write',
  reminderLeadMinutes: 30,
  dailyBriefTime: '08:00',
  heartbeatMinutes: 60,
  heartbeatIdleWake: true,
  quietStart: '22:00',
  quietEnd: '08:00',
  watchdogStallMinutes: 10,
  wechatEnabled: true,
  wechatReplyMaxChars: 100,
} as const

/** The settings each assistant has for itself. */
export interface AssistantSettings {
  /** What this assistant's workers may change; picked in its IM tab. */
  readonly sandboxMode: SandboxMode
  readonly reminderLeadMinutes: number
  /** `HH:MM` local time of the daily brief, or an empty string when it is off. */
  readonly dailyBriefTime: string
  /** Minutes between heartbeats; 0 turns them off, and with them the wake-ups that have no other reason. */
  readonly heartbeatMinutes: number
  /** Whether a heartbeat with nothing due still reaches the model. */
  readonly heartbeatIdleWake: boolean
  /** `HH:MM` local start of the daily quiet hours; empty, like an end equal to it, means none. */
  readonly quietStart: string
  /** `HH:MM` local end of the daily quiet hours. */
  readonly quietEnd: string
  /** Start of the temporary quiet hours, epoch milliseconds. */
  readonly tempQuietFrom?: number
  /** End of the temporary quiet hours, epoch milliseconds. */
  readonly tempQuietUntil?: number
  readonly watchdogStallMinutes: number
  readonly wechatEnabled: boolean
  readonly wechatReplyMaxChars: number
}

/** The shortest WeChat message the settings allow (im-robot's own minimum). */
export const MIN_WECHAT_REPLY_CHARS = 10

/** The shortest heartbeat interval other than 0 (off), in minutes. */
export const MIN_HEARTBEAT_MINUTES = 5

/** The longest heartbeat interval: a day. */
export const MAX_HEARTBEAT_MINUTES = 1440

/** The shortest stall the watchdog acts on, in minutes. */
export const MIN_WATCHDOG_MINUTES = 2

/** Bounds of the compaction ratio setting. */
export const COMPACT_RATIO_RANGE = { min: 0.3, max: 0.85 } as const

/** The longest balance check interval: a week, well below what a timer can hold. */
export const MAX_BALANCE_CHECK_MINUTES = 10_080

/**
 * One assistant: the user it serves sets it up on the page with a
 * name, what it should call them, and a workspace folder holding its one
 * conversation.
 */
export interface Person {
  /** Stable id chosen by the page; also the WeChat binding id. */
  readonly id: string
  /** The assistant's name, shown on its tab. */
  readonly name: string
  /** What the assistant calls its user; absent when they left it empty. */
  readonly address?: string
  /** Absolute workspace folder, chosen when the assistant is created. */
  readonly cwd?: string
  /** Where the user said they are, in their words, when the assistant was created; the assistant works out the time zone from it. */
  readonly zoneHint?: string
  /** The person's conversation; the host creates it and writes it back. */
  readonly sessionId?: string
  /** What this assistant changed from `ASSISTANT_DEFAULTS`. */
  readonly settings?: Partial<AssistantSettings>
}

/** How a binding hands a message to a conversation that is still working: wait in line, or join the running turn. */
export type WechatSendMode = 'queue' | 'steer'

/** The per-binding options the IM tab edits. */
export interface WechatOptions {
  readonly sendMode?: WechatSendMode
  /** Whether a WeChat message starting with `/` runs as a command. */
  readonly commands?: boolean
}

/** What the page can ask the host to do with one person's WeChat. */
export const WECHAT_ACTIONS = ['bind', 'unbind', 'cancel', 'reconnect', 'diagnose', 'options'] as const

/** A WeChat request the page writes; a new nonce makes the host act again. */
export interface WechatRequest {
  readonly personId: string
  readonly action: (typeof WECHAT_ACTIONS)[number]
  readonly nonce: string
  /** The options to apply, with `action: 'options'`. */
  readonly options?: WechatOptions
}

/** One step of a connection diagnosis, in plain Chinese. */
export interface WechatCheck {
  readonly label: string
  readonly ok: boolean
  readonly detail?: string
}

/** One person's WeChat binding as the host reports it. */
export interface WechatState {
  readonly status: 'qr' | 'scanned' | 'bound' | 'expired' | 'failed' | 'unbound'
  /** Text to encode as the QR code, while `status` is `qr`. */
  readonly qr?: string
  /** When the QR code stops working, epoch milliseconds. */
  readonly expiresAt?: number
  /** Masked WeChat user id once bound. */
  readonly user?: string
  /** Plain-language reason for `expired` or `failed`. */
  readonly reason?: string
  /** While bound: whether messages are being received. */
  readonly connected?: boolean
  /** While bound: the latest unresolved problem, in plain Chinese. */
  readonly lastError?: string
  readonly sendMode?: WechatSendMode
  readonly commands?: boolean
  /** The latest diagnosis. */
  readonly diagnosis?: { readonly ok: boolean; readonly checks: readonly WechatCheck[]; readonly at: number }
  /** Why the latest reconnect, diagnosis, or option change could not run. */
  readonly notice?: string
  /** When the host wrote this state, epoch milliseconds. */
  readonly updatedAt: number
}

/** Settings fields only the page and the host use; the settings page hides them. */
export const INTERNAL_FIELDS = ['people', 'wechatRequest', 'wechatState'] as const

/** @returns the value as a non-empty trimmed string, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Read the assistant list.
 * @param value - the stored `people` value.
 * @returns well-formed people in stored order, first entry winning on a duplicate id.
 */
export function readPeople(value: unknown): Person[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const people: Person[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const id = text(record.id)
    const name = text(record.name)
    if (id === undefined || name === undefined || seen.has(id)) continue
    seen.add(id)
    const address = text(record.address)
    const cwd = text(record.cwd)
    const sessionId = text(record.sessionId)
    const zoneHint = text(record.zoneHint)
    const settings = readAssistantSettings(record.settings)
    people.push({
      id,
      name,
      ...(address === undefined ? {} : { address }),
      ...(cwd === undefined ? {} : { cwd }),
      ...(zoneHint === undefined ? {} : { zoneHint }),
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(settings === undefined ? {} : { settings }),
    })
  }
  return people
}

/** @returns the integer when it is at least `min`, else undefined. */
function atLeast(value: unknown, min: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min ? value : undefined
}

/** @returns a usable heartbeat interval: 0, or within the bounds. */
function heartbeatInterval(value: unknown): number | undefined {
  if (!Number.isInteger(value)) return undefined
  const minutes = value as number
  return minutes === 0 || (minutes >= MIN_HEARTBEAT_MINUTES && minutes <= MAX_HEARTBEAT_MINUTES) ? minutes : undefined
}

/** @returns a usable instant, epoch milliseconds. */
function instant(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Read an assistant's stored settings.
 * @param value - the stored `settings` of one assistant list entry.
 * @returns the well-formed fields, or undefined when none is.
 */
export function readAssistantSettings(value: unknown): Partial<AssistantSettings> | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const fields: Partial<AssistantSettings> = {
    ...fieldOf('sandboxMode', SANDBOX_MODES.includes(record.sandboxMode as SandboxMode) ? record.sandboxMode as SandboxMode : undefined),
    ...fieldOf('reminderLeadMinutes', atLeast(record.reminderLeadMinutes, 0)),
    ...fieldOf('dailyBriefTime', typeof record.dailyBriefTime === 'string' ? record.dailyBriefTime.trim() : undefined),
    ...fieldOf('heartbeatMinutes', heartbeatInterval(record.heartbeatMinutes)),
    ...fieldOf('heartbeatIdleWake', typeof record.heartbeatIdleWake === 'boolean' ? record.heartbeatIdleWake : undefined),
    ...fieldOf('quietStart', typeof record.quietStart === 'string' ? record.quietStart.trim() : undefined),
    ...fieldOf('quietEnd', typeof record.quietEnd === 'string' ? record.quietEnd.trim() : undefined),
    ...fieldOf('tempQuietFrom', instant(record.tempQuietFrom)),
    ...fieldOf('tempQuietUntil', instant(record.tempQuietUntil)),
    ...fieldOf('watchdogStallMinutes', atLeast(record.watchdogStallMinutes, MIN_WATCHDOG_MINUTES)),
    ...fieldOf('wechatEnabled', typeof record.wechatEnabled === 'boolean' ? record.wechatEnabled : undefined),
    ...fieldOf('wechatReplyMaxChars', atLeast(record.wechatReplyMaxChars, MIN_WECHAT_REPLY_CHARS)),
  }
  return Object.keys(fields).length === 0 ? undefined : fields
}

/** @returns the one-field object, or an empty one when the value is missing. */
function fieldOf<K extends keyof AssistantSettings>(key: K, value: AssistantSettings[K] | undefined): Partial<AssistantSettings> {
  return value === undefined ? {} : { [key]: value }
}

/**
 * One assistant's settings with defaults for what it never changed.
 * @param person - the assistant; undefined gives the defaults.
 * @returns every field.
 */
export function assistantSettings(person: Pick<Person, 'settings'> | undefined): AssistantSettings {
  return { ...ASSISTANT_DEFAULTS, ...person?.settings }
}

/**
 * Read the models workers may run.
 * @param value - the stored `workerModels` value.
 * @returns the well-formed models without repeats; the defaults when none is left, since a worker must run something.
 */
export function readWorkerModels(value: unknown): WorkerModel[] {
  const seen = new Set<string>()
  const models: WorkerModel[] = []
  for (const entry of Array.isArray(value) ? value as unknown[] : []) {
    if (entry === null || typeof entry !== 'object') continue
    const provider = text((entry as Record<string, unknown>).provider)
    const model = text((entry as Record<string, unknown>).model)
    if (provider === undefined || model === undefined || seen.has(`${provider}/${model}`)) continue
    seen.add(`${provider}/${model}`)
    models.push({ provider, model })
  }
  return models.length === 0 ? [...DEFAULT_WORKER_MODELS] : models
}

/**
 * Read the pending WeChat request.
 * @param value - the stored `wechatRequest` value.
 * @returns the request, or undefined when there is none or it is malformed.
 */
export function readWechatRequest(value: unknown): WechatRequest | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const personId = text(record.personId)
  const nonce = text(record.nonce)
  const action = record.action
  if (personId === undefined || nonce === undefined) return undefined
  if (!(WECHAT_ACTIONS as readonly unknown[]).includes(action)) return undefined
  const options = readWechatOptions(record.options)
  return { personId, action: action as WechatRequest['action'], nonce, ...(options === undefined ? {} : { options }) }
}

/** @returns the well-formed options, or undefined when none is. */
export function readWechatOptions(value: unknown): WechatOptions | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const sendMode = record.sendMode === 'queue' || record.sendMode === 'steer' ? record.sendMode : undefined
  const commands = typeof record.commands === 'boolean' ? record.commands : undefined
  if (sendMode === undefined && commands === undefined) return undefined
  return { ...(sendMode === undefined ? {} : { sendMode }), ...(commands === undefined ? {} : { commands }) }
}

/** @returns the well-formed diagnosis, or undefined. */
function readDiagnosis(value: unknown): WechatState['diagnosis'] {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.ok !== 'boolean' || typeof record.at !== 'number' || !Array.isArray(record.checks)) return undefined
  const checks: WechatCheck[] = []
  for (const entry of record.checks as unknown[]) {
    if (entry === null || typeof entry !== 'object') continue
    const check = entry as Record<string, unknown>
    const label = text(check.label)
    if (label === undefined || typeof check.ok !== 'boolean') continue
    const detail = text(check.detail)
    checks.push({ label, ok: check.ok, ...(detail === undefined ? {} : { detail }) })
  }
  return { ok: record.ok, checks, at: record.at }
}

const STATUSES = new Set<WechatState['status']>(['qr', 'scanned', 'bound', 'expired', 'failed', 'unbound'])

/**
 * Read every person's WeChat state.
 * @param value - the stored `wechatState` value.
 * @returns person id → well-formed state.
 */
export function readWechatStates(value: unknown): Record<string, WechatState> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const states: Record<string, WechatState> = {}
  for (const [personId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const status = record.status as WechatState['status']
    if (!STATUSES.has(status)) continue
    const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : 0
    const qr = text(record.qr)
    const user = text(record.user)
    const reason = text(record.reason)
    const expiresAt = typeof record.expiresAt === 'number' ? record.expiresAt : undefined
    const lastError = text(record.lastError)
    const notice = text(record.notice)
    const options = readWechatOptions(record)
    const diagnosis = readDiagnosis(record.diagnosis)
    states[personId] = {
      status,
      updatedAt,
      ...(qr === undefined ? {} : { qr }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      ...(user === undefined ? {} : { user }),
      ...(reason === undefined ? {} : { reason }),
      ...(typeof record.connected === 'boolean' ? { connected: record.connected } : {}),
      ...(lastError === undefined ? {} : { lastError }),
      ...options,
      ...(diagnosis === undefined ? {} : { diagnosis }),
      ...(notice === undefined ? {} : { notice }),
    }
  }
  return states
}

/**
 * A folder name for a person: their name with characters no file system
 * accepts replaced by "-".
 * @param name - the person's name.
 * @returns a single path segment, never empty and never "." or "..".
 */
export function folderName(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|\u0000-\u001F]/gu, '-').trim()
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? 'untitled' : cleaned
}
