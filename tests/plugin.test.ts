import { mkdtempSync } from 'node:fs'
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
    },
  }
  ctx = new FakeContext(services)
  mounted.push(ctx)
  apply(ctx as never, config as never)
  const service = ctx.get('dshAssisstant') as AssistantService
  const settle = () => new Promise(resolve => setTimeout(resolve, 10))
  const update = (patch: Record<string, unknown>) => services.settings.mutate('dsh-assisstant', Object.entries(patch).map(([key, value]) => ({ path: [key], value })))
  return { ctx, store, registry, agents, created, prompts, robotCalls, childModels, titles, renames, service, settle, update, root, setLogin: (states: ImLoginState[]) => { loginStates = states } }
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
    const family = fakeAgent(fakeSession('r1'), { provider: 'p', model: 'chosen', reasoningEffort: 'low' })
    agents.set('r1', family)
    registry.presets.set('r1', 'dsh-assisstant')
    await update({ compactRatio: 0.8 })
    expect(family.selections).toEqual([])
    expect(family.model.current()).toEqual({ provider: 'p', model: 'chosen', reasoningEffort: 'low' })
  })

  it('moves a live conversation at once when its assistant\'s permission changes', async () => {
    const person = { id: 'mom', name: '妈妈', cwd: '/w', sessionId: 'r1' }
    const { agents, update } = setup({ people: [person] })
    const family = fakeAgent(fakeSession('r1'))
    agents.set('r1', family)
    await update({ compactRatio: 0.8 })
    expect(family.session.appended).toEqual([])
    await update({ people: [{ ...person, settings: { sandboxMode: 'read-only' } }] })
    expect(family.session.appended).toEqual([{ type: 'sandbox/mode', data: { mode: 'read-only' } }])
  })

  it('titles each assistant conversation with its assistant\'s name and keeps it', async () => {
    const { ctx, agents, registry, titles, renames, update, settle } = setup({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 'r1' }] })
    const family = fakeAgent(fakeSession('r1'))
    const worker = fakeAgent(fakeSession('w1', { parentSession: 'r1' }))
    const other = fakeAgent(fakeSession('o1'))
    for (const agent of [family, worker, other]) agents.set(agent.id, agent)
    registry.presets.set('r1', 'dsh-assisstant')
    registry.presets.set('w1', 'dsh-assisstant')
    titles.set('r1', { title: '交房租每日提醒', source: { kind: 'fallback' } })
    for (const agent of [family, worker, other]) ctx.emit('agent/created', { agent })
    await settle()
    expect(renames).toEqual(['r1:阿福'])

    await update({ people: [{ id: 'mom', name: '小福', cwd: '/w', sessionId: 'r1' }] })
    expect(renames).toEqual(['r1:阿福', 'r1:小福'])

    // A title from the host's automatic titling or the session list is replaced.
    titles.set('r1', { title: '看牙医', source: { kind: 'provider' } })
    ctx.emit('session/event', family.session, { type: 'session/title', data: titles.get('r1') })
    await settle()
    expect(renames).toEqual(['r1:阿福', 'r1:小福', 'r1:小福'])
    expect(titles.get('r1')?.title).toBe('小福')
  })

  describe('on a host whose preset registry has no presetForSession (0.2.1-rc.5)', () => {
    it('still titles and tells assistant sessions from others', async () => {
      const { ctx, agents, registry, renames, update, settle } = setup({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 'r1' }] }, { registry: new OldRegistry() })
      const family = fakeAgent(fakeSession('r1'))
      const other = fakeAgent(fakeSession('o1'))
      agents.set('r1', family)
      agents.set('o1', other)
      registry.presets.set('r1', 'dsh-assisstant')
      ctx.emit('agent/created', { agent: family })
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
    expect(robotCalls).toContain('binding-options:mom:{"enabled":true,"replyMaxChars":800}')
    expect(robotCalls).toContain('binding-options:dad:{"enabled":false,"replyMaxChars":100}')
    expect(robotCalls.some(call => call.startsWith('binding-options:kid'))).toBe(false)
    robotCalls.length = 0
    await update({ wechatState: { mom: { status: 'bound', updatedAt: 1 }, dad: { status: 'bound', updatedAt: 1 }, kid: { status: 'bound', updatedAt: 2 } } })
    expect(robotCalls).toContain('binding-options:kid:{"enabled":true,"replyMaxChars":100}')
  })

  it('tells complete-subagent which models workers may run, and again when they change', async () => {
    const { childModels, update } = setup({ workerModels: [{ provider: 'p', model: 'a' }, { provider: 'p', model: 'b' }] })
    expect(childModels.at(-1)).toEqual([{ provider: 'p', model: 'a' }, { provider: 'p', model: 'b' }])
    await update({ workerModels: [{ provider: 'p', model: 'b' }] })
    expect(childModels.at(-1)).toEqual([{ provider: 'p', model: 'b' }])
  })
})
