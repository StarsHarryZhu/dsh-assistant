/**
 * dsh-assisstant policy, mounted once in each hidden preset.
 *
 * `role: router` (the `dsh-assisstant` preset, each user's own
 * conversation):
 * - router.md as the whole system prompt;
 * - contexts: the calendar, the workspace (who it is, profile, persona,
 *   projects), this week's schedule parsed from `ddl.md`, the balance
 *   reminder, the WeChat reply rule when the latest input came from WeChat, and
 *   the permission when it is not the default;
 * - the permission pin (the sandbox mode the assistant's IM tab chose, never
 *   ask); the model and effort are whatever the composer chose for this
 *   conversation;
 * - only complete-subagent's delegation and review tools among global tools;
 * - the record tools, the `balance_check` tool, and the `/ddl` command, which
 *   prints the week view itself.
 *
 * `role: worker` (the `dsh-assisstant-worker` preset every `delegate` child
 * runs on): worker.md, the calendar and workspace contexts, the record tools
 * but the profile's and persona's, and only `request_write_access` among
 * global tools.
 * @module dsh-assisstant/policy
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { guarded } from './host/service.ts'
import type { AssistantService } from './host/service.ts'
import { formatYuan, reminderFor } from './host/balance.ts'
import { calendarText } from './host/calendar.ts'
import { parseDdl, weekView } from './host/ddl.ts'
import { assistantSettings } from './shared/settings.ts'
import type { SandboxMode } from './shared/settings.ts'
import { RecordStore } from './host/records/store.ts'
import { recordTools } from './host/records/tools.ts'
import { createToolFence } from './host/tool-fence.ts'
import type {
  AgentLike,
  AgentsLike,
  AssemblyLike,
  CommandsLike,
  PresentationLike,
  ScheduleLike,
  SessionLike,
  SystemPromptLike,
  ToolsLike,
} from './host/types.ts'
import { workspaceText } from './host/workspace.ts'

export const name = 'dsh-assisstant-policy'
export const inject = ['systemPrompt', 'tools', 'agents', 'dshAssisstant']

/** Which preset this instance serves. */
export type Role = 'router' | 'worker'

export interface Config {
  role: Role
}

export const Config: z<Config> = z.object({
  role: z.union(['router', 'worker']).default('router').description('Which hidden preset this policy row serves'),
}) as unknown as z<Config>

/** Global tools each role keeps (all of them complete-subagent's). */
export const ALLOWED_TOOLS: Record<Role, readonly string[]> = {
  router: ['delegate', 'answer_write_request', 'grant_write_access', 'revoke_write_access'],
  worker: ['request_write_access'],
}

/** The prompt section name of each role, which the assemble hook keys on. */
export const SECTION: Record<Role, string> = {
  router: 'dsh-assisstant:router',
  worker: 'dsh-assisstant:worker',
}

/** The services this plugin reads, beyond what cordis types. */
interface HostContext {
  readonly systemPrompt: SystemPromptLike
  readonly tools: ToolsLike
  readonly agents: AgentsLike
  readonly dshAssisstant: AssistantService
  get(name: 'commands'): CommandsLike | undefined
  get(name: 'schedule'): ScheduleLike | undefined
  on(name: string, listener: (...args: never[]) => unknown): () => void
}

/**
 * Keep only this role's section: the prompt is complete, so persona or
 * instruction sections another plugin adds globally stay out.
 * @param assembly - the presentation after the downstream hooks.
 * @param role - this instance's role.
 * @returns the presentation with only this role's section.
 */
export function settleSections<T extends PresentationLike>(assembly: T, role: Role): T {
  return { ...assembly, sections: assembly.sections.filter(section => section.name === SECTION[role]) }
}

/** @returns the router's text for the low-balance reminder, or an empty string. */
export function balanceText(service: AssistantService): string {
  const { balanceThreshold, balanceReminder } = service.settings()
  const reminder = reminderFor(service.balance(), balanceThreshold, balanceReminder)
  if (reminder === undefined) return ''
  return `# Balance\n\nThe account balance is low. After you finish answering the user, add this sentence once, word for word, as the last line of this reply: ${reminder}\nDo not mention the balance otherwise.`
}

/** @returns what the router must know when an assistant's permission is not the default the prompt assumes. */
export function permissionText(mode: SandboxMode): string {
  if (mode === 'read-only') {
    return '# Permission\n\nThis assistant is read-only: workers cannot change any file and you cannot grant anything, so deny write-access requests. Your own records still work. When a request needs files changed, say in one plain sentence that the current permission does not allow it and that it can be changed in the IM tab.'
  }
  if (mode === 'danger-full-access') {
    return '# Permission\n\nThis assistant has full access to this computer, which replaces the workspace limit under "Approving workers\' write access": you can grant paths, and start workers, outside the workspace folder. Allow what the task plainly needs when the user asked for that place; still deny hidden files, keys, system folders, and other users\' folders unless they asked for exactly that.'
  }
  return ''
}

/** @returns the WeChat reply rule when the latest input came from WeChat, else an empty string. */
export function channelText(service: AssistantService, sessionId: string): string {
  if (service.lastInput(sessionId) !== 'wechat') return ''
  const chars = assistantSettings(service.personForSession(sessionId)).wechatReplyMaxChars
  return [
    '# Reply channel: WeChat',
    '',
    `The user wrote from WeChat, and your reply is sent there as chat messages of at most ${chars} characters each, split at sentence breaks. Write like a person chatting: plain text, no Markdown, short complete sentences, and keep the whole reply brief. Say only the result or what they need to decide; never report progress or steps.`,
    'When a list, table, or set of steps must stay in one message, wrap that block in <keep> and </keep> (the markers are not shown; one block holds at most 2000 characters).',
  ].join('\n')
}

/**
 * Apply the policy.
 * @param ctx - the preset-scoped plugin context.
 * @param config - this row's role.
 */
export function apply(ctx: Context, config: Config): void {
  const host = ctx as unknown as HostContext
  const role: Role = config?.role === 'worker' ? 'worker' : 'router'
  const service = host.dshAssisstant
  const prompt = readFileSync(new URL(`./host/${role}.md`, import.meta.url), 'utf8')

  // A worker reads its assistant conversation's zone.
  const routerSessionOf = (agent: AgentLike | undefined): SessionLike | undefined => {
    if (agent === undefined) return undefined
    if (role === 'router') return agent.session
    const parent = agent.session.header.parentSession
    return parent === undefined ? undefined : host.agents.get(parent)?.session
  }
  const zoneOf = (agent: AgentLike | undefined): string => service.zoneFor(routerSessionOf(agent))
  const personOf = (agent: AgentLike | undefined) => {
    const session = routerSessionOf(agent)
    return session === undefined ? undefined : service.personForSession(session.id)
  }

  ctx.effect(() => host.systemPrompt.section({ name: SECTION[role], order: 0, text: prompt, interpolate: false }))
  host.on('system-prompt/assemble', (async (_assembly: unknown, _context: unknown, next: () => Promise<PresentationLike>) =>
    settleSections(await next(), role)) as never)

  ctx.effect(() => host.systemPrompt.context({
    name: 'dsh-assisstant:calendar',
    order: 105,
    required: true,
    interpolate: false,
    text: assembly => calendarText(new Date(), zoneOf(assembly?.agent)),
  }))
  ctx.effect(() => host.systemPrompt.context({
    name: 'dsh-assisstant:workspace',
    order: 106,
    interpolate: false,
    text: (assembly) => {
      const person = personOf(assembly?.agent)
      const settings = service.settings()
      return workspaceText(person?.cwd ?? assembly?.agent?.session.header.cwd, {
        name: person?.name,
        address: person?.address,
        profileMaxChars: settings.profileMaxChars,
        personaMaxChars: settings.personaMaxChars,
        personaSelfCorrect: settings.personaSelfCorrect,
        personaCooldownHours: settings.personaCooldownHours,
      }, Date.now())
    },
  }))

  // The fence and the permission pin come first: neither depends on the router's extras.
  const fence = createToolFence(host.tools, ALLOWED_TOOLS[role])
  const warn = (message: string): void => { ctx.logger.warn(message) }
  host.on('tools/change', guarded(warn, 'tool fence', () => { fence.refresh() }) as never)
  ctx.effect(() => () => fence.dispose())

  // ---- the fixed permissions on the assistant conversation ----
  // Agent and session events reach a preset's plugins only for that preset's agents.
  const governed = (session: SessionLike): boolean => role === 'router' && session.header.parentSession === undefined
  const modeOf = (session: SessionLike): SandboxMode => assistantSettings(service.personForSession(session.id)).sandboxMode
  const pinPermissions = (session: SessionLike): void => {
    session.append('sandbox/mode', { mode: modeOf(session) })
    session.append('approval/policy', { policy: 'never' })
  }
  host.on('agent/created', guarded(warn, 'pin', ({ agent }: { agent: AgentLike }) => {
    if (!governed(agent.session)) return
    pinPermissions(agent.session)
  }) as never)
  host.on('session/event', guarded(warn, 'pin', (session: SessionLike, event: { type: string; data?: { mode?: string; policy?: string } }) => {
    if (!governed(session)) return
    // The conversation view's permission picker is hidden on the page; a change made anyway (a command) is undone.
    if ((event.type === 'sandbox/mode' && event.data?.mode !== modeOf(session))
      || (event.type === 'approval/policy' && event.data?.policy !== 'never')
      || event.type === 'agent-preset/selected') {
      queueMicrotask(guarded(warn, 'permission pin', () => { pinPermissions(session) }))
    }
  }) as never)

  // ---- the record tools: in this preset's scope, so no other session sees them ----
  for (const tool of recordTools(role, {
    target: (agent) => {
      const session = routerSessionOf(agent)
      const person = session === undefined ? undefined : service.personForSession(session.id)
      const root = person?.cwd ?? session?.header.cwd
      return session === undefined || root === undefined
        ? undefined
        : { store: new RecordStore(root), zone: service.zoneFor(session), sessionId: session.id, leadMinutes: assistantSettings(person).reminderLeadMinutes }
    },
    settings: () => service.settings(),
    schedule: () => host.get('schedule'),
  })) ctx.effect(() => host.tools.register(tool))

  if (role === 'worker') return

  ctx.effect(() => host.systemPrompt.context({
    name: 'dsh-assisstant:schedule',
    order: 107,
    interpolate: false,
    text: (assembly) => {
      const cwd = personOf(assembly?.agent)?.cwd ?? assembly?.agent?.session.header.cwd
      if (cwd === undefined) return ''
      let file: string
      try {
        file = readFileSync(join(cwd, 'ddl.md'), 'utf8')
      } catch {
        return '# Schedule (ddl.md)\n\nNo ddl.md yet: nothing is recorded.'
      }
      return `# Schedule (ddl.md, converted to the user's time)\n\nThe host parsed ddl.md for you; trust this view and answer schedule questions from it.\n\n${weekView(parseDdl(file), new Date(), zoneOf(assembly?.agent))}`
    },
  }))
  ctx.effect(() => host.systemPrompt.context({
    name: 'dsh-assisstant:balance',
    order: 108,
    interpolate: false,
    text: () => balanceText(service),
  }))
  ctx.effect(() => host.systemPrompt.context({
    name: 'dsh-assisstant:channel',
    order: 109,
    interpolate: false,
    text: assembly => (assembly?.agent === undefined ? '' : channelText(service, assembly.agent.session.id)),
  }))
  ctx.effect(() => host.systemPrompt.context({
    name: 'dsh-assisstant:permission',
    order: 110,
    interpolate: false,
    text: assembly => permissionText(assistantSettings(personOf(assembly?.agent)).sandboxMode),
  }))

  // ---- the balance tool and /ddl ----
  ctx.effect(() => host.tools.register(defineTool({
    name: 'balance_check',
    description: 'Check the RMB balance of the account the assistant runs on, and whether it is below the recharge reminder threshold.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          known: { type: 'boolean', required: true },
          yuan: { type: 'number' },
          threshold: { type: 'number', required: true },
          low: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.known
          ? `Balance ${formatYuan(value.yuan as number)} yuan, reminder threshold ${value.threshold} yuan${value.low ? ', below the threshold' : ''}.`
          : `The balance cannot be read right now; reminder threshold ${value.threshold} yuan.`,
      }],
    },
    execute: async () => {
      const state = await service.refreshBalance()
      const threshold = service.settings().balanceThreshold
      return state.status === 'known'
        ? { known: true, yuan: state.yuan, threshold, low: state.yuan < threshold }
        : { known: false, threshold, low: false }
    },
  })))
  const commands = host.get('commands')
  if (commands !== undefined) {
    ctx.effect(() => commands.register({
      name: 'ddl',
      description: '列出未来一周的 DDL 和日程',
      handler: ({ agent }) => {
        const cwd = personOf(agent)?.cwd ?? agent.session.header.cwd
        let file = ''
        try {
          file = cwd === undefined ? '' : readFileSync(join(cwd, 'ddl.md'), 'utf8')
        } catch {
          // No file yet: an empty week.
        }
        return { kind: 'success', text: weekView(parseDdl(file), new Date(), zoneOf(agent)) }
      },
    }))
  }
}

/** Kept for tests that assemble a prompt without an agent. */
export type { AssemblyLike }
