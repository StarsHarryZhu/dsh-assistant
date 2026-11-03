import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED_TOOLS, SECTION, apply, balanceText, channelText, permissionText, settleSections } from '../src/policy.ts'
import { apply as applyCompactor, due } from '../src/compactor.ts'
import type { SharedSettings } from '../src/host/service.ts'
import type { SandboxMode } from '../src/shared/settings.ts'
import { FakeContext, FakeTools, fakeAgent, fakeService, fakeSession } from './helpers.ts'

function mount(role: 'router' | 'worker', options: { cwd?: string; settings?: Partial<SharedSettings>; sandboxMode?: SandboxMode } = {}) {
  const sections: { name: string; text: string }[] = []
  const contexts: { name: string; text: (assembly: unknown) => string }[] = []
  const commands: { name: string; handler: (input: { agent: unknown }) => { kind: string; text: string } }[] = []
  const tools = new FakeTools()
  for (const name of ['delegate', 'delegate_fork', 'answer_write_request', 'grant_write_access', 'revoke_write_access', 'request_write_access', 'ui_render', 'working_directory']) {
    tools.globals.add(name)
  }
  const cwd = options.cwd ?? '/nowhere'
  const own = options.sandboxMode === undefined ? {} : { settings: { sandboxMode: options.sandboxMode } }
  const service = fakeService(options.settings, [{ id: 'mom', name: '阿福', address: '妈妈', cwd, sessionId: 'r1', ...own }])
  const agents = new Map<string, ReturnType<typeof fakeAgent>>()
  const ctx = new FakeContext({
    systemPrompt: {
      section: (entry: { name: string; text: string }) => { sections.push(entry); return () => undefined },
      context: (entry: { name: string; text: (assembly: unknown) => string }) => { contexts.push(entry); return () => undefined },
    },
    tools,
    agents: { get: (id: string) => agents.get(id), list: () => agents.values() },
    dshAssisstant: service,
    commands: { register: (command: (typeof commands)[number]) => { commands.push(command); return () => undefined } },
  })
  tools.onChange = () => { ctx.emit('tools/change') }
  apply(ctx as never, { role })
  return { ctx, sections, contexts, commands, tools, service, agents }
}

describe('the router policy', () => {
  it('installs the complete prompt, five contexts, the balance tool, and /ddl', () => {
    const { sections, contexts, tools, commands } = mount('router')
    expect(sections.map(section => section.name)).toEqual([SECTION.router])
    expect(sections[0]?.text).toContain('records yourself, everything else to workers')
    expect(contexts.map(context => context.name)).toEqual([
      'dsh-assisstant:calendar', 'dsh-assisstant:workspace', 'dsh-assisstant:schedule', 'dsh-assisstant:balance', 'dsh-assisstant:channel', 'dsh-assisstant:permission',
    ])
    expect(tools.scoped.map(tool => tool.name).sort()).toEqual(['balance_check', 'calendar_add', 'calendar_update', 'list_update', 'log_add', 'memo_set', 'persona_set', 'profile_set', 'project_update', 'recall'])
    expect(commands.map(command => command.name)).toEqual(['ddl'])
  })

  it('keeps only its delegation and review tools among global tools', () => {
    const { tools } = mount('router')
    expect(tools.visibleGlobals()).toEqual([...ALLOWED_TOOLS.router].sort())
  })

  it('pins permissions and the model on the assistant conversation only', async () => {
    const { ctx, agents } = mount('router')
    const root = fakeAgent(fakeSession('r1'))
    const child = fakeAgent(fakeSession('w1', { parentSession: 'r1' }))
    agents.set('r1', root)
    ctx.emit('agent/created', { agent: root })
    ctx.emit('agent/created', { agent: child })
    expect(root.session.appended).toEqual([
      { type: 'sandbox/mode', data: { mode: 'workspace-write' } },
      { type: 'approval/policy', data: { policy: 'never' } },
    ])
    expect(root.selections).toEqual([])
    expect(child.session.appended).toEqual([])
    expect(child.selections).toEqual([])

    ctx.emit('session/event', root.session, { type: 'model/selection', data: { provider: 'x', model: 'y', reasoningEffort: 'low' } })
    await Promise.resolve()
    expect(root.selections).toEqual([])
    expect(root.session.appended).toHaveLength(2)

    root.session.appended.length = 0
    ctx.emit('session/event', root.session, { type: 'sandbox/mode', data: { mode: 'workspace-write' } })
    ctx.emit('session/event', root.session, { type: 'approval/policy', data: { policy: 'on-request' } })
    await Promise.resolve()
    expect(root.session.appended).toEqual([
      { type: 'sandbox/mode', data: { mode: 'workspace-write' } },
      { type: 'approval/policy', data: { policy: 'never' } },
    ])
  })

  it('shows this week\'s schedule from ddl.md and prints it on /ddl', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dsa-policy-'))
    writeFileSync(join(cwd, 'ddl.md'), `- [ ] ${new Date(Date.now() + 3_600_000).toISOString().slice(0, 16)}Z · 日程 · 测试日程\n`)
    const { contexts, commands } = mount('router', { cwd })
    const agent = fakeAgent(fakeSession('r1', { cwd }))
    const schedule = contexts.find(context => context.name === 'dsh-assisstant:schedule')?.text({ agent }) ?? ''
    expect(schedule).toContain('测试日程')
    expect(commands[0]?.handler({ agent }).text).toContain('测试日程')
    const workspace = contexts.find(context => context.name === 'dsh-assisstant:workspace')?.text({ agent }) ?? ''
    expect(workspace).toContain('Your name is 阿福')
    expect(workspace).toContain('asked to be called 妈妈')
  })

  it('says when nothing is recorded yet', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dsa-policy-empty-'))
    const { contexts } = mount('router', { cwd })
    const agent = fakeAgent(fakeSession('r1', { cwd }))
    const schedule = contexts.find(context => context.name === 'dsh-assisstant:schedule')?.text({ agent }) ?? ''
    expect(schedule).toContain('No ddl.md yet')
  })

  it('writes a record into the family member\'s folder, for the conversation and for a worker in a subfolder', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dsa-policy-records-'))
    const router = mount('router', { cwd })
    const session = fakeSession('r1', { cwd: '/elsewhere' })
    const call = (tools: FakeTools, name: string, args: unknown, agent: unknown) =>
      (tools.scoped.find(tool => tool.name === name) as unknown as { execute(args: unknown, exec: unknown): Promise<{ ok: boolean }> }).execute(args, { agent })
    expect((await call(router.tools, 'memo_set', { key: '钥匙', value: '鞋柜' }, fakeAgent(session))).ok).toBe(true)
    expect(readFileSync(join(cwd, 'memo.md'), 'utf8')).toContain('钥匙：鞋柜')
    const workers = mount('worker', { cwd })
    workers.agents.set('r1', fakeAgent(session))
    const child = fakeAgent(fakeSession('w1', { parentSession: 'r1', cwd: join(cwd, 'projects', '装修') }))
    expect((await call(workers.tools, 'memo_set', { key: '师傅', value: '老李' }, child)).ok).toBe(true)
    expect(readFileSync(join(cwd, 'memo.md'), 'utf8')).toContain('师傅：老李')
    const lost = fakeAgent(fakeSession('w2', { parentSession: 'gone', cwd: '/elsewhere' }))
    expect((await call(workers.tools, 'memo_set', { key: 'x', value: 'y' }, lost)).ok).toBe(false)
  })

  it('pins the permission the assistant chose and tells the router when it is not the default', async () => {
    const { ctx, contexts } = mount('router', { sandboxMode: 'danger-full-access' })
    const root = fakeAgent(fakeSession('r1'))
    ctx.emit('agent/created', { agent: root })
    expect(root.session.appended[0]).toEqual({ type: 'sandbox/mode', data: { mode: 'danger-full-access' } })
    root.session.appended.length = 0
    ctx.emit('session/event', root.session, { type: 'sandbox/mode', data: { mode: 'danger-full-access' } })
    await Promise.resolve()
    expect(root.session.appended).toEqual([])
    ctx.emit('session/event', root.session, { type: 'sandbox/mode', data: { mode: 'workspace-write' } })
    await Promise.resolve()
    expect(root.session.appended[0]).toEqual({ type: 'sandbox/mode', data: { mode: 'danger-full-access' } })
    const text = contexts.find(context => context.name === 'dsh-assisstant:permission')?.text({ agent: root })
    expect(text).toContain('full access to this computer')
    expect(permissionText('read-only')).toContain('deny write-access requests')
    expect(permissionText('workspace-write')).toBe('')
  })

  it('keeps a failing pin inside the plugin on every path, including the deferred ones', async () => {
    const { ctx } = mount('router')
    const session = fakeSession('r1')
    session.append = () => { throw new Error('pin broke') }
    const failing = fakeAgent(session)
    expect(() => {
      ctx.emit('agent/created', { agent: failing })
      ctx.emit('session/event', session, { type: 'sandbox/mode', data: { mode: 'read-only' } })
      ctx.emit('session/event', session, { type: 'agent-preset/selected', data: { agentPreset: 'dsh-assisstant' } })
    }).not.toThrow()
    const uncaught: unknown[] = []
    const onError = (error: unknown) => { uncaught.push(error) }
    process.on('uncaughtException', onError)
    await new Promise(resolve => setTimeout(resolve, 5))
    process.off('uncaughtException', onError)
    expect(uncaught).toEqual([])
    expect(ctx.warnings.join('\n')).toContain('pin broke')
  })

  it('registers the record tools in the preset\'s scope, never as global tools', () => {
    const { tools } = mount('router')
    expect([...tools.globals]).not.toContain('calendar_add')
    expect(tools.scoped.map(tool => tool.name)).toContain('calendar_add')
  })

  it('adds the balance reminder and the WeChat rule only when due', () => {
    const service = fakeService({ balanceThreshold: 10, balanceReminder: '余额 {balance}' })
    expect(balanceText(service)).toBe('')
    service.setBalance({ status: 'known', yuan: 3, checkedAt: 0 })
    expect(balanceText(service)).toContain('余额 3.00')
    expect(channelText(service, 's')).toBe('')
    service.markInput('s', 'wechat')
    expect(channelText(service, 's')).toContain('at most 100 characters each')
    expect(channelText(service, 's')).toContain('<keep> and </keep>')
  })

  it('keeps only its own prompt section', () => {
    expect(settleSections({ sections: [{ name: 'persona' }, { name: SECTION.router }] }, 'router').sections).toEqual([{ name: SECTION.router }])
  })
})

describe('the worker policy', () => {
  it('leaves a worker on the model delegate chose, and its permissions alone', async () => {
    const { ctx, agents } = mount('worker')
    const worker = fakeAgent(fakeSession('w1', { parentSession: 'r1' }))
    agents.set('w1', worker)
    ctx.emit('agent/created', { agent: worker })
    ctx.emit('session/event', worker.session, { type: 'model/selection', data: { provider: 'x', model: 'y', reasoningEffort: 'max' } })
    await Promise.resolve()
    expect(worker.selections).toEqual([])
    expect(worker.session.appended).toEqual([])
  })

  it('installs its prompt and two contexts, and keeps only request_write_access', () => {
    const { sections, contexts, tools, commands } = mount('worker')
    expect(sections.map(section => section.name)).toEqual([SECTION.worker])
    expect(sections[0]?.text).toContain('background worker')
    expect(contexts.map(context => context.name)).toEqual(['dsh-assisstant:calendar', 'dsh-assisstant:workspace'])
    expect(tools.visibleGlobals()).toEqual(['request_write_access'])
    expect(tools.scoped.map(tool => tool.name).sort()).toEqual(['calendar_add', 'calendar_update', 'list_update', 'log_add', 'memo_set', 'project_update', 'recall'])
    expect(commands).toEqual([])
  })
})

describe('the compactor', () => {
  it('compacts an assistant conversation after a turn that reached the ratio', async () => {
    expect(due({ pressureTokens: 75, contextWindow: 100 }, 0.75)).toBe(true)
    expect(due({ pressureTokens: 74, contextWindow: 100 }, 0.75)).toBe(false)
    expect(due({ pressureTokens: 1, contextWindow: 0 }, 0.75)).toBe(false)

    const compacted: string[] = []
    let pressure = 80
    const root = fakeAgent(fakeSession('r1'))
    const ctx = new FakeContext({
      compaction: { compactNow: async (agent: { id: string }) => { compacted.push(agent.id) } },
      tokenMeter: { contextPressure: () => ({ pressureTokens: pressure, contextWindow: 100 }) },
      agents: { get: (id: string) => (id === 'r1' ? root : undefined), list: () => [root] },
      dshAssisstant: fakeService({ compactRatio: 0.75 }),
    })
    applyCompactor(ctx as never)
    ctx.emit('session/event', root.session, { type: 'turn/end' })
    ctx.emit('session/event', fakeSession('w1', { parentSession: 'r1' }), { type: 'turn/end' })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(compacted).toEqual(['r1'])
    pressure = 10
    ctx.emit('session/event', root.session, { type: 'turn/end' })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(compacted).toEqual(['r1'])
  })

  it('reads the pressure from the session projection on a host whose token meter has no contextPressure (0.2.1-rc.5)', async () => {
    const compacted: string[] = []
    const root = fakeAgent(fakeSession('r1'))
    const ctx = new FakeContext({
      compaction: { compactNow: async (agent: { id: string }) => { compacted.push(agent.id) } },
      tokenMeter: {},
      sessionProjections: { stateOf: (_session: unknown, key: string) => (key === 'contextPressure' ? { surfaceTokens: 0, pressureTokens: 80, contextWindow: 100 } : undefined) },
      agents: { get: (id: string) => (id === 'r1' ? root : undefined), list: () => [root] },
      dshAssisstant: fakeService({ compactRatio: 0.75 }),
    })
    applyCompactor(ctx as never)
    ctx.emit('session/event', root.session, { type: 'turn/end' })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(ctx.warnings).toEqual([])
    expect(compacted).toEqual(['r1'])
  })

  it('does not compact before the host has recorded the pressure', () => {
    expect(due({}, 0.75)).toBe(false)
    expect(due({ pressureTokens: 80 }, 0.75)).toBe(false)
    expect(due({ contextWindow: 100 }, 0.75)).toBe(false)
  })
})
