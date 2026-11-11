import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Config, apply } from '../src/index.ts'
import type { AssistantService } from '../src/host/service.ts'
import type { ImLoginState } from '../src/host/types.ts'
import { FakeContext, fakeAgent, fakeSession } from './helpers.ts'

/** The preset registry as DSH 0.2.1-rc.5 has it: no `presetForSession`, which came in 0.2.2-alpha.2. */
class OldRegistry {
  readonly presets = new Map<string, string>()
  async list() { return [{ id: 'standard' }, { id: 'dsh-assisstant' }, { id: 'dsh-assisstant-worker' }] }
}

class Registry extends OldRegistry {
  presetForSession(session: { id: string }) { return this.presets.get(session.id) ?? null }
}

const mounted: FakeContext[] = []
afterEach(() => { for (const ctx of mounted.splice(0)) ctx.dispose() })

function setup(initial: Record<string, unknown> = {}, host: { registry?: OldRegistry } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsa-plugin-'))
  const store: Record<string, unknown> = { ...initial }
  const config = new Proxy({}, { get: (_target, key: string) => ({ get: () => store[key] }) })
  const registry = host.registry ?? new Registry()
  const agents = new Map<string, ReturnType<typeof fakeAgent>>()
  const created: { cwd?: string; agentPreset?: string }[] = []
  const prompts: { sessionId: string; text: string }[] = []
  const robotCalls: string[] = []
  const scheduleCalls: string[] = []
  const childModels: unknown[] = []
  let loginStates: ImLoginState[] = []
  const titles = new Map<string, { title: string; source: { kind: string } }>()
  const renames: string[] = []
  let ctx: FakeContext
  const services = {
    agents: { get: (id: string) => agents.get(id), list: () => agents.values() },
    agentPresets: registry,
    sessionProjections: {
      register: async () => ({ stateOf: () => ({ timeZone: null }) }),
      stateOf: (session: { id: string }, key: string) => (key === 'agentPreset' ? registry.presets.get(session.id) ?? null : undefined),
    },
    sessionController: {
      create: async (request: { cwd?: string; agentPreset?: string }) => {
        created.push(request)
        return { sessionId: `session-${created.length}` }
      },
      resolveAgent: async (sessionId: string) => ({
        agent: { followup: (message: { content: { text: string }[] }) => { prompts.push({ sessionId, text: message.content[0]?.text ?? '' }) } },
      }),
      cancel: () => undefined,
    },
    settings: {
      describe: () => [{ ns: 'dsh-assisstant' }],
      mutate: async (_ns: string, ops: readonly { path: readonly string[]; value: unknown }[]) => {
        for (const op of ops) store[op.path[0] as string] = op.value
        ctx.emit('loader/volatile-update')
      },
    },
    sessionTitle: {
      get: (session: { id: string }) => titles.get(session.id),
      rename: (session: { id: string }, title: string) => {
        renames.push(`${session.id}:${title}`)
        const snapshot = { title, source: { kind: 'user' } }
        titles.set(session.id, snapshot)
        ctx.emit('session/event', session, { type: 'session/title', data: snapshot })
        return snapshot
      },
    },
    completeSubagent: { setChildModels: (models: unknown) => { childModels.push(models) } },
    imRobot: {
      async *login(bindingId: string) {
        robotCalls.push(`login:${bindingId}`)
        for (const state of loginStates) yield state
      },
      bind: async (bindingId: string, target: { sessionId: string }) => { robotCalls.push(`bind:${bindingId}:${target.sessionId}`) },
      unbind: async (bindingId: string) => { robotCalls.push(`unbind:${bindingId}`) },
      status: () => ({ bound: false }),
      setBindingOptions: (bindingId: string, options: unknown) => { robotCalls.push(`binding-options:${bindingId}:${JSON.stringify(options)}`) },
      send: (bindingId: string, text: string) => { robotCalls.push(`send:${bindingId}:${text}`) },
      route: (bindingId: string, route: { chat: boolean; notBefore?: number; files?: readonly string[] }) => {
        robotCalls.push(`route:${bindingId}:${route.chat}${route.notBefore === undefined ? '' : ':held'}${route.files === undefined ? '' : `:${route.files.join('|')}`}`)
        return true
      },
    },
    schedule: {
      list: async ({ sessionId }: { sessionId: string }) => (sessionId === 's-mom' ? [{ id: 'old-1' }, { id: 'old-2' }] : []),
      delete: async ({ sessionId, id }: { sessionId: string; id: string }) => { scheduleCalls.push(`${sessionId}:${id}`) },
    },
  }
  ctx = new FakeContext(services)
  mounted.push(ctx)
  apply(ctx as never, config as never)
  const service = ctx.get('dshAssisstant') as AssistantService
  const settle = () => new Promise(resolve => setTimeout(resolve, 10))
  const update = (patch: Record<string, unknown>) => services.settings.mutate('dsh-assisstant', Object.entries(patch).map(([key, value]) => ({ path: [key], value })))
  return { ctx, store, registry, agents, created, prompts, robotCalls, scheduleCalls, childModels, titles, renames, service, settle, update, root, setLogin: (states: ImLoginState[]) => { loginStates = states } }
}

describe('the settings row', () => {
  it('provides the service with defaults and hides both presets', async () => {
    const { service, registry } = setup()
    expect(service.settings().compactRatio).toBe(0.5)
    expect((await registry.list()).map(row => row.id)).toEqual(['standard'])
  })

  it('creates a conversation for each new assistant in the folder it chose and writes it back', async () => {
    const { store, created, prompts, settle } = setup({ people: [{ id: 'mom', name: '妈妈', cwd: '/w/mom' }] })
    await settle()
    expect(created).toEqual([{ cwd: '/w/mom', agentPreset: 'dsh-assisstant' }])
    expect(store.people).toEqual([{ id: 'mom', name: '妈妈', cwd: '/w/mom', sessionId: 'session-1' }])
    // A session that never ran a turn is a blank page in the host's view, so the assistant speaks first.
    expect(prompts.map(prompt => prompt.sessionId)).toEqual(['session-1'])
    expect(prompts[0]?.text).toContain('first meeting')
    expect(prompts[0]?.text).toContain('ask in the same message')
  })

  it('hands the new assistant what the user wrote about where they are', async () => {
    const { prompts, settle } = setup({ people: [{ id: 'mom', name: '妈妈', cwd: '/w/mom', zoneHint: '上海' }] })
    await settle()
    expect(prompts[0]?.text).toContain('"上海"')
    expect(prompts[0]?.text).toContain('field Time zone')
  })

  it('creates no conversation for an entry without a folder', async () => {
    const { store, created, settle } = setup({ people: [{ id: 'mom', name: '妈妈' }] })
    await settle()
    expect(created).toEqual([])
    expect(store.people).toEqual([{ id: 'mom', name: '妈妈' }])
  })

  it('still loads a row that stored settings moved elsewhere', () => {
    const resolved = (Config as unknown as (value: unknown) => Record<string, unknown>)({ workspaceRoot: '~/x', watchdogStallMinutes: 120, workerModel: 'deepseek-pro' })
    expect(resolved).toHaveProperty('workerModels')
  })

  it('runs a WeChat binding request and stores each state for the page', async () => {
    const { store, update, settle, robotCalls, setLogin } = setup({ people: [{ id: 'mom', name: '妈妈', cwd: '/w', sessionId: 's-mom' }] })
    setLogin([{ status: 'qr', qr: 'https://qr', expiresAt: 9 }, { status: 'bound', user: 'wx***' }])
    await update({ wechatRequest: { personId: 'mom', action: 'bind', nonce: 'n1' } })
    await settle()
    expect(robotCalls).toContain('login:mom')
    expect(robotCalls).toContain('bind:mom:s-mom')
    expect((store.wechatState as Record<string, { status: string }>).mom?.status).toBe('bound')
  })

  it('drops the QR code when the binding is cancelled, leaving other assistants alone', async () => {
    const { store, update, settle } = setup({
      people: [{ id: 'mom', name: '妈妈', cwd: '/w', sessionId: 's-mom' }, { id: 'dad', name: '爸爸', cwd: '/d', sessionId: 's-dad' }],
      wechatState: { mom: { status: 'qr', qr: 'https://qr', updatedAt: 1 }, dad: { status: 'bound', user: 'u', updatedAt: 1 } },
    })
    await settle()
    await update({ wechatRequest: { personId: 'mom', action: 'cancel', nonce: 'c1' } })
    await settle()
    expect(store.wechatState).toEqual({ dad: { status: 'bound', user: 'u', updatedAt: 1 } })
  })

  it('unbinds a removed person and forgets their state', async () => {
    const { store, update, settle, robotCalls } = setup({
      people: [{ id: 'mom', name: '妈妈', cwd: '/w', sessionId: 's-mom' }],
      wechatState: { mom: { status: 'bound', user: 'u', updatedAt: 1 } },
    })
    await update({ people: [] })
    await settle()
    expect(robotCalls).toContain('unbind:mom')
    expect(store.wechatState).toEqual({})
  })

  it('expires a QR code left from before a restart, and ignores the stored request', async () => {
    const { store, settle, robotCalls } = setup({
      wechatState: { mom: { status: 'qr', qr: 'x', updatedAt: 1 } },
      wechatRequest: { personId: 'mom', action: 'bind', nonce: 'old' },
    })
    await settle()
    expect((store.wechatState as Record<string, { status: string }>).mom?.status).toBe('expired')
    expect(robotCalls.some(call => call.startsWith('login'))).toBe(false)
  })

  it('leaves each assistant conversation on the model its composer chose when the settings change', async () => {
    const { agents, registry, update } = setup()
    const user = fakeAgent(fakeSession('r1'), { provider: 'p', model: 'chosen', reasoningEffort: 'low' })
    agents.set('r1', user)
    registry.presets.set('r1', 'dsh-assisstant')
    await update({ compactRatio: 0.8 })
    expect(user.selections).toEqual([])
    expect(user.model.current()).toEqual({ provider: 'p', model: 'chosen', reasoningEffort: 'low' })
  })

  it('moves a live conversation at once when its assistant\'s permission changes', async () => {
    const person = { id: 'mom', name: '妈妈', cwd: '/w', sessionId: 'r1' }
    const { agents, update } = setup({ people: [person] })
    const user = fakeAgent(fakeSession('r1'))
    agents.set('r1', user)
    await update({ compactRatio: 0.8 })
    expect(user.session.appended).toEqual([])
    await update({ people: [{ ...person, settings: { sandboxMode: 'read-only' } }] })
    expect(user.session.appended).toEqual([{ type: 'sandbox/mode', data: { mode: 'read-only' } }])
  })

  it('titles each assistant conversation with its assistant\'s name and keeps it', async () => {
    const { ctx, agents, registry, titles, renames, update, settle } = setup({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 'r1' }] })
    const user = fakeAgent(fakeSession('r1'))
    const worker = fakeAgent(fakeSession('w1', { parentSession: 'r1' }))
    const other = fakeAgent(fakeSession('o1'))
    for (const agent of [user, worker, other]) agents.set(agent.id, agent)
    registry.presets.set('r1', 'dsh-assisstant')
    registry.presets.set('w1', 'dsh-assisstant')
    titles.set('r1', { title: '交房租每日提醒', source: { kind: 'fallback' } })
    for (const agent of [user, worker, other]) ctx.emit('agent/created', { agent })
    await settle()
    expect(renames).toEqual(['r1:阿福'])

    await update({ people: [{ id: 'mom', name: '小福', cwd: '/w', sessionId: 'r1' }] })
    expect(renames).toEqual(['r1:阿福', 'r1:小福'])

    // A title from the host's automatic titling or the session list is replaced.
    titles.set('r1', { title: '看牙医', source: { kind: 'provider' } })
    ctx.emit('session/event', user.session, { type: 'session/title', data: titles.get('r1') })
    await settle()
    expect(renames).toEqual(['r1:阿福', 'r1:小福', 'r1:小福'])
    expect(titles.get('r1')?.title).toBe('小福')
  })

  describe('on a host whose preset registry has no presetForSession (0.2.1-rc.5)', () => {
    it('still titles and tells assistant sessions from others', async () => {
      const { ctx, agents, registry, renames, update, settle } = setup({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 'r1' }] }, { registry: new OldRegistry() })
      const user = fakeAgent(fakeSession('r1'))
      const other = fakeAgent(fakeSession('o1'))
      agents.set('r1', user)
      agents.set('o1', other)
      registry.presets.set('r1', 'dsh-assisstant')
      ctx.emit('agent/created', { agent: user })
      ctx.emit('agent/created', { agent: other })
      await settle()
      expect(renames).toEqual(['r1:阿福'])
      expect(renames).not.toContain('o1:阿福')
    })
  })

  it('keeps a failure in its listeners away from the host and logs it once', async () => {
    const registry = new Registry()
    registry.presetForSession = () => { throw new Error('host changed') }
    const { ctx, update } = setup({}, { registry })
    const session = fakeSession('o1')
    expect(() => {
      ctx.emit('session/event', session, { type: 'turn/start' })
      ctx.emit('session/event', session, { type: 'turn/end' })
      ctx.emit('agent/created', { agent: fakeAgent(session) })
    }).not.toThrow()
    expect(ctx.warnings.filter(line => line.includes('host changed') && line.includes('session event'))).toHaveLength(1)
    await expect(update({ compactRatio: 0.8 })).resolves.toBeUndefined()
  })

  it('tracks where the latest input came from', () => {
    const { ctx, service, registry } = setup()
    const session = fakeSession('r1')
    registry.presets.set('r1', 'dsh-assisstant')
    ctx.emit('im-robot/inbound', 'r1', 'wechat')
    expect(service.lastInput('r1')).toBe('wechat')
    ctx.emit('session/event', session, { type: 'user/message', data: { source: { kind: 'user', clientTimeZone: 'Asia/Shanghai' } } })
    expect(service.lastInput('r1')).toBe('web')
  })

  it('gives each bound account its own assistant\'s WeChat options', async () => {
    const { robotCalls, update } = setup({
      people: [
        { id: 'mom', name: '妈妈', cwd: '/w', sessionId: 's-mom', settings: { wechatReplyMaxChars: 800 } },
        { id: 'dad', name: '爸爸', cwd: '/d', sessionId: 's-dad', settings: { wechatEnabled: false } },
        { id: 'kid', name: '孩子', cwd: '/k', sessionId: 's-kid' },
      ],
      wechatState: { mom: { status: 'bound', updatedAt: 1 }, dad: { status: 'bound', updatedAt: 1 } },
    })
    expect(robotCalls).toContain('binding-options:mom:{"enabled":true,"replyMaxChars":800,"mediaDir":"/w/IM/WeChat"}')
    expect(robotCalls).toContain('binding-options:dad:{"enabled":false,"replyMaxChars":100,"mediaDir":"/d/IM/WeChat"}')
    expect(robotCalls.some(call => call.startsWith('binding-options:kid'))).toBe(false)
    robotCalls.length = 0
    await update({ wechatState: { mom: { status: 'bound', updatedAt: 1 }, dad: { status: 'bound', updatedAt: 1 }, kid: { status: 'bound', updatedAt: 2 } } })
    expect(robotCalls).toContain('binding-options:kid:{"enabled":true,"replyMaxChars":100,"mediaDir":"/k/IM/WeChat"}')
  })

  it('has the assistant introduce itself on WeChat after each binding, even in quiet hours', async () => {
    const { update, settle, prompts, robotCalls, setLogin, service, ctx } = setup({
      people: [{ id: 'mom', name: '妈妈', cwd: '/w', sessionId: 's-mom', settings: { quietStart: '00:00', quietEnd: '23:59' } }],
    })
    setLogin([{ status: 'bound', user: 'wx***' }])
    await update({ wechatRequest: { personId: 'mom', action: 'bind', nonce: 'n1' } })
    await settle()
    expect(prompts.at(-1)?.sessionId).toBe('s-mom')
    expect(prompts.at(-1)?.text).toContain('just connected their WeChat')
    expect(robotCalls.some(call => call.startsWith('binding-options:mom:') && call.includes('"mediaDir":"/w/IM/WeChat"'))).toBe(true)
    const person = service.people()[0]!
    expect(service.routeChat(person, 's-mom', true)).toEqual({ status: 'routed' })
    expect(robotCalls).toContain('route:mom:true')
    // One turn only: afterwards quiet hours hold again.
    ctx.emit('session/event', fakeSession('s-mom'), { type: 'turn/end' })
    await update({ wechatRequest: { personId: 'mom', action: 'unbind', nonce: 'n2' } })
    await settle()
    const count = prompts.length
    await update({ wechatRequest: { personId: 'mom', action: 'bind', nonce: 'n3' } })
    await settle()
    expect(prompts.length).toBe(count + 1)
  })

  it('routes a reply to the chat app, held in quiet hours unless the user is talking now, and says when nothing is connected', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsa-chat-'))
    writeFileSync(join(root, 'profile.md'), '# Profile\n\n- Time zone: UTC\n')
    const registry = new Registry()
    const hour = new Date().getUTCHours()
    const pad = (value: number) => String(value % 24).padStart(2, '0')
    const inQuiet = { quietStart: `${pad(hour)}:00`, quietEnd: `${pad(hour + 2)}:00` }
    const { service, robotCalls, ctx, store, settle } = setup({
      people: [{ id: 'mom', name: '妈妈', cwd: root, sessionId: 's-mom', settings: inQuiet }],
      wechatState: { mom: { status: 'bound', updatedAt: 1 } },
    }, { registry })
    await settle()
    registry.presets.set('s-mom', 'dsh-assisstant')
    const person = service.people()[0]!
    expect(service.zoneFor(fakeSession('s-mom'))).toBe('UTC')
    expect(service.routeChat(person, 's-mom', true)).toMatchObject({ status: 'held' })
    expect(robotCalls.filter(call => call.startsWith('route:'))).toEqual(['route:mom:true:held'])
    // Files are held with the reply.
    expect(service.routeChat(person, 's-mom', true, ['/w/a.png', '/w/b.pdf'])).toMatchObject({ status: 'held' })
    expect(robotCalls.at(-1)).toBe('route:mom:true:held:/w/a.png|/w/b.pdf')
    expect(service.routeChat(person, 's-mom', false)).toEqual({ status: 'kept' })
    expect(robotCalls.at(-1)).toBe('route:mom:false')
    expect(service.turnFromUser('s-mom')).toBe(false)
    ctx.emit('session/event', fakeSession('s-mom'), { type: 'turn/start' })
    ctx.emit('session/event', fakeSession('s-mom'), { type: 'user/message', data: { source: { kind: 'user' } } })
    expect(service.turnFromUser('s-mom')).toBe(true)
    expect(service.routeChat(person, 's-mom', true)).toEqual({ status: 'routed' })
    expect(robotCalls.at(-1)).toBe('route:mom:true')
    ctx.emit('session/event', fakeSession('s-mom'), { type: 'turn/end' })
    expect(service.turnFromUser('s-mom')).toBe(false)
    store.wechatState = {}
    expect(service.chatConnected(person)).toBe(false)
    expect(service.routeChat(person, 's-mom', true)).toEqual({ status: 'unavailable' })
  })

  it('removes what earlier versions left among the host\'s automation tasks', async () => {
    const { scheduleCalls, settle } = setup({ people: [{ id: 'mom', name: '妈妈', cwd: '/w', sessionId: 's-mom' }] })
    await settle()
    expect(scheduleCalls).toEqual(['s-mom:old-1', 's-mom:old-2'])
  })

  it('stores what the assistant changes in its settings, dropping defaults and what is unset', async () => {
    const { service, store } = setup({ people: [{ id: 'mom', name: '妈妈', cwd: '/w', sessionId: 's-mom', settings: { tempQuietUntil: 5, reminderLeadMinutes: 10 } }] })
    await service.updateSettings('mom', { quietStart: '23:00', quietEnd: '08:00', tempQuietUntil: undefined })
    expect((store.people as { settings: unknown }[])[0]?.settings).toEqual({ reminderLeadMinutes: 10, quietStart: '23:00' })
  })

  it('tells complete-subagent which models workers may run, and again when they change', async () => {
    const { childModels, update } = setup({ workerModels: [{ provider: 'p', model: 'a' }, { provider: 'p', model: 'b' }] })
    expect(childModels.at(-1)).toEqual([{ provider: 'p', model: 'a' }, { provider: 'p', model: 'b' }])
    await update({ workerModels: [{ provider: 'p', model: 'b' }] })
    expect(childModels.at(-1)).toEqual([{ provider: 'p', model: 'b' }])
  })
})
