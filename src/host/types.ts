/**
 * Structural mirrors of the host services this plugin reads.
 *
 * At runtime the host half imports only `@deepseek-ai/cordis`,
 * `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-tools`, Node built-ins, and
 * (lazily, in the sub-plugin group) `@deepseek-ai/dsh-app-boot`. These types
 * mirror only the fields it uses; each names its source.
 * @module dsh-assisstant/host/types
 */

/** `SessionHeader` of `@deepseek-ai/dsh-session`. */
export interface SessionHeaderLike {
  readonly id: string
  readonly cwd?: string
  readonly parentSession?: string
  readonly origin?: 'subagent'
}

/** `Session` of `@deepseek-ai/dsh-session`. */
export interface SessionLike {
  readonly id: string
  readonly header: SessionHeaderLike
  /** Append one durable event (`sandbox/mode`, `approval/policy`, …). */
  append(type: string, data: unknown): unknown
}

/** `Agent` of `@deepseek-ai/dsh-agent`. */
export interface AgentLike {
  readonly id: string
  readonly session: SessionLike
  /** `running` while a turn runs. */
  readonly status?: string
  /** Queue one message as a turn of its own, and wake the agent. */
  followup(message: unknown): unknown
}

/** `ctx.agents` (`AgentRegistry`). */
export interface AgentsLike {
  get(id: string): AgentLike | undefined
  list(): Iterable<AgentLike>
}

/** One row of `AgentPresetRegistry.list()`. */
export interface PresetRowLike {
  readonly id: string
}

/** `ctx.agentPresets` (`AgentPresetRegistry` of `@deepseek-ai/dsh-agent-preset-registry`). */
export interface AgentPresetsLike {
  /** Since 0.2.2-alpha.2; see compat.ts. */
  presetForSession?(session: SessionLike): string | null
  list(): Promise<readonly PresetRowLike[]>
}

/** One user content part of `SessionPromptRequest`. */
export interface PromptTextPart {
  readonly type: 'text'
  readonly text: string
}

/** A message from the host, not a person (`UserMessage` of `@deepseek-ai/dsh-llm`, under a source kind of its own). */
export interface HostNoteLike {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly PromptTextPart[]
  readonly source: { readonly kind: 'host-note'; readonly plugin: string }
}

/** `ctx.sessionController` (`ApiSessionController` of `@deepseek-ai/dsh-api-session-controller`). */
export interface SessionControllerLike {
  create(request: { cwd?: string; agentPreset?: string; sessionId?: string }): Promise<{ readonly sessionId: string }>
  /** The session's agent; a cold session is resumed. */
  resolveAgent(sessionId: string): Promise<{ readonly agent: AgentLike } | { readonly error: unknown }>
  /** Stop the session's running turn. */
  cancel(request: { sessionId: string }): unknown
}

/** One settings form as `ctx.settings.describe()` reports it. */
export interface SettingsFormLike {
  readonly ns: string
}

/** `ctx.settings` (the settings service of `@deepseek-ai/dsh-settings`). */
export interface SettingsLike {
  describe(options?: { redactSecrets?: boolean }): readonly SettingsFormLike[]
  mutate(ns: string, ops: readonly { op: 'set'; path: readonly string[]; value: unknown }[]): Promise<unknown>
}

/** A resolved credential (`CredentialHit` of `@deepseek-ai/dsh-credentials`). */
export interface CredentialHitLike {
  readonly value: string
  readonly source?: string
}

/** `ctx.credentials` (`CredentialsService`); references are branded strings at runtime. */
export interface CredentialsLike {
  resolve(ref: string): Promise<CredentialHitLike | undefined>
}

/** `AccountWallet` of `@deepseek-ai/dsh-deepseek-account`. */
export interface AccountWalletLike {
  readonly currency: string
  readonly balance: string
}

/** `AccountDetails['balance']`. */
export type AccountBalanceLike =
  | { readonly status: 'ready'; readonly value: readonly AccountWalletLike[]; readonly bonusWallets: readonly AccountWalletLike[] }
  | { readonly status: 'failed' }

/** `ctx.deepseekAccount` (`DeepseekAccountService`). */
export interface DeepseekAccountLike {
  getBalance(client: { version: string; locale: string; timezoneOffsetSeconds: number }): Promise<AccountBalanceLike | null>
}

/** `ctx.tools` (`ToolsService` of `@deepseek-ai/dsh-tools`). */
export interface ToolsLike {
  register(definition: unknown): () => void
  /** Mask global tools for the calling scope; the scope's own tools stay visible. */
  restrict(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void
  /** Called without a scope: every global tool, as the model would see it. */
  schemas(): readonly { readonly name: string }[]
}

/** `AssembleContext` fields the prompt providers read. */
export interface AssemblyLike {
  readonly agent?: AgentLike
}

/** One prompt section of an assembled system prompt. */
export interface SectionLike {
  readonly name: string
}

/** The assembled presentation the `system-prompt/assemble` hook passes through. */
export interface PresentationLike {
  readonly sections: readonly SectionLike[]
}

/** `ctx.systemPrompt` (`SystemPromptService`). */
export interface SystemPromptLike {
  section(entry: { name: string; order: number; text: string; interpolate: false }): () => void
  context(entry: { name: string; order: number; required?: boolean; interpolate: false; text: (assembly: AssemblyLike | undefined) => string }): () => void
}

/** `ctx.commands` (`CommandsService`). */
export interface CommandsLike {
  register(command: {
    name: string
    description: string
    handler: (input: { agent: AgentLike }) => { kind: 'success'; text: string } | Promise<{ kind: 'success'; text: string }>
  }): () => void
}

/** A session projection registration (`ProjectionHandle`). */
export interface ProjectionHandleLike<S> {
  stateOf(session: SessionLike): S
}

/** `ctx.sessionProjections` (`SessionProjections`); a registration lives as long as the registering context. */
export interface SessionProjectionsLike {
  register<S>(definition: unknown): Promise<ProjectionHandleLike<S>> | ProjectionHandleLike<S>
  /** One unit's state; deprecated since 0.2.2-alpha.2 in favor of the owning service. */
  stateOf?(session: SessionLike, key: string): unknown
}

/** `ctx.tokenMeter`. */
export interface TokenMeterLike {
  /** Since 0.2.2-alpha.2; see compat.ts. */
  contextPressure?(session: SessionLike): { readonly pressureTokens?: number; readonly contextWindow?: number }
}

/** `ctx.compaction` inside the preset's compaction group. */
export interface CompactionLike {
  compactNow(agent: AgentLike, signal: AbortSignal): Promise<unknown>
}

/** One login state of the im-robot service. */
export type ImLoginState =
  | { readonly status: 'qr'; readonly qr: string; readonly expiresAt: number }
  | { readonly status: 'scanned' }
  | { readonly status: 'bound'; readonly user: string }
  | { readonly status: 'expired' | 'failed'; readonly reason: string }

/** One binding's status as im-robot reports it. */
export interface ImBindingStatus {
  readonly bound: boolean
  readonly user?: string
  readonly sessionId?: string
  readonly connected?: boolean
  readonly lastError?: string
  readonly sendMode?: 'queue' | 'steer'
  readonly commands?: boolean
}

/** One im-robot connection diagnosis. */
export interface ImDiagnosis {
  readonly ok: boolean
  readonly checks: readonly { readonly label: string; readonly ok: boolean; readonly detail?: string }[]
}

/**
 * `ctx.imRobot`, the service of the im-robot sub-plugin. The per-binding
 * options, reconnect, and diagnose are newer than the rest; the link reports
 * an outdated sub-plugin when they are missing.
 */
export interface ImRobotLike {
  login(bindingId: string, channel: 'wechat', signal?: AbortSignal): AsyncIterable<ImLoginState>
  bind(bindingId: string, target: { sessionId: string }): Promise<void>
  unbind(bindingId: string): Promise<void>
  status(bindingId: string): ImBindingStatus | Promise<ImBindingStatus>
  setBindingOptions?(bindingId: string, options: { sendMode?: 'queue' | 'steer'; commands?: boolean; enabled?: boolean; replyMaxChars?: number; mediaDir?: string }): unknown
  /** Send text to the account through its outbox; throws when the binding cannot send. Since im-robot 0.2.0. */
  send?(bindingId: string, text: string): void
  reconnect?(bindingId: string): Promise<ImBindingStatus>
  diagnose?(bindingId: string): Promise<ImDiagnosis>
}

/** `ctx.completeSubagent`: the models a `delegate` child may run. */
export interface CompleteSubagentLike {
  setChildModels(models: readonly { readonly provider: string; readonly model: string }[]): void
}

/** A stored automation task (`ScheduleRecord` of `@deepseek-ai/dsh-schedule`); 0.2.2 adds its target. */
export interface ReminderRecordLike {
  readonly id: string
  readonly target?: { readonly kind: string; readonly sessionId?: string }
}

/**
 * `ctx.schedule` (`ScheduleService` of `@deepseek-ai/dsh-schedule`): only to remove what earlier versions left there.
 * 0.2.1-rc.5 lists and deletes one session's tasks; 0.2.2 lists every task (`catalog`), stops a session's active
 * ones (`stopSessionTasks`), and deletes through `edit`.
 */
export interface ScheduleLike {
  list?(request: { sessionId: string }): Promise<unknown>
  delete?(request: { sessionId: string; id: string }): Promise<unknown>
  catalog?(): Promise<readonly ReminderRecordLike[]>
  stopSessionTasks?(sessionId: string): Promise<void>
  /** The acting session hears of no change it made itself. */
  edit?(request: { id: string; action: 'delete' }, actorSessionId?: string): Promise<unknown>
}

/** `ctx.sessionTitle` (`SessionTitleService` of `@deepseek-ai/dsh-session-title`). */
export interface SessionTitleLike {
  get(session: SessionLike): { readonly title: string; readonly source: { readonly kind: string } } | undefined
  /** Accept a user title, which pins it against automatic titling; the session must be live. */
  rename(session: SessionLike, title: string): { readonly title: string }
}

/** The global tools the assistant agents keep: complete-subagent's six. */
export const ALLOWED_GLOBAL_TOOLS: readonly string[] = [
  'delegate',
  'delegate_fork',
  'request_write_access',
  'answer_write_request',
  'grant_write_access',
  'revoke_write_access',
]
