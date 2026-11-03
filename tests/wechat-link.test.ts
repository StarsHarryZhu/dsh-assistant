import { describe, expect, it } from 'vitest'
import type { WechatState } from '../src/shared/settings.ts'
import type { ImLoginState, ImRobotLike } from '../src/host/types.ts'
import { REASONS, WechatLink } from '../src/host/wechat-link.ts'

function robot(states: ImLoginState[]) {
  const calls: string[] = []
  const service: ImRobotLike = {
    async *login(bindingId) {
      calls.push(`login:${bindingId}`)
      for (const state of states) yield state
    },
    bind: async (bindingId, target) => { calls.push(`bind:${bindingId}:${target.sessionId}`) },
    unbind: async (bindingId) => { calls.push(`unbind:${bindingId}`) },
    status: () => ({ bound: false }),
    setOptions: () => undefined,
  }
  return { service, calls }
}

function link(service: ImRobotLike | undefined, sessionId: string | null = 's-mom', initial: Record<string, WechatState> = {}) {
  const writes: { id: string; state: WechatState | null }[] = []
  const warnings: string[] = []
  const states: Record<string, WechatState> = { ...initial }
  const instance = new WechatLink({
    robot: () => service,
    people: () => [{ id: 'mom', name: '妈妈', ...(sessionId === null ? {} : { sessionId }) }],
    writeState: async (id, state) => {
      writes.push({ id, state })
      if (state === null) delete states[id]
      else states[id] = state
    },
    readState: id => states[id],
    warn: (message) => { warnings.push(message) },
    now: () => 42,
  })
  return { instance, writes, warnings }
}

describe('the WeChat link', () => {
  it('reports every login state and binds the person\'s conversation when bound', async () => {
    const { service, calls } = robot([
      { status: 'qr', qr: 'https://qr', expiresAt: 99 },
      { status: 'scanned' },
      { status: 'bound', user: 'wx***1' },
    ])
    const { instance, writes } = link(service)
    await instance.handle({ personId: 'mom', action: 'bind', nonce: 'n1' })
    expect(calls).toEqual(['login:mom', 'bind:mom:s-mom'])
    expect(writes.map(write => write.state?.status)).toEqual(['qr', 'scanned', 'bound'])
    expect(writes[0]?.state).toEqual({ status: 'qr', qr: 'https://qr', expiresAt: 99, updatedAt: 42 })
    expect(writes[2]?.state).toEqual({ status: 'bound', user: 'wx***1', connected: true, updatedAt: 42 })
  })

  const bound: WechatState = { status: 'bound', user: 'wx***1', connected: true, updatedAt: 1 }

  it('reconnects, diagnoses, and changes options through the newer im-robot calls, merging the outcome', async () => {
    const { service, calls } = robot([])
    let sendMode: 'queue' | 'steer' = 'queue'
    service.status = () => ({ bound: true, user: 'wx***1', connected: true, sendMode, commands: true })
    service.reconnect = async (id) => { calls.push(`reconnect:${id}`); return { bound: true, connected: false, lastError: '网络不通' } }
    service.diagnose = async (id) => { calls.push(`diagnose:${id}`); return { ok: false, checks: [{ label: '服务可达', ok: false, detail: '超时' }] } }
    service.setBindingOptions = async (id, options) => { calls.push(`options:${id}:${JSON.stringify(options)}`); sendMode = options.sendMode ?? sendMode }
    const { instance, writes } = link(service, 's-mom', { mom: bound })
    await instance.handle({ personId: 'mom', action: 'reconnect', nonce: 'r' })
    expect(writes.at(-1)?.state).toEqual({ status: 'bound', user: 'wx***1', connected: false, lastError: '网络不通', updatedAt: 42 })
    await instance.handle({ personId: 'mom', action: 'diagnose', nonce: 'd' })
    expect(writes.at(-1)?.state?.diagnosis).toEqual({ ok: false, at: 42, checks: [{ label: '服务可达', ok: false, detail: '超时' }] })
    await instance.handle({ personId: 'mom', action: 'options', nonce: 'o', options: { sendMode: 'steer' } })
    expect(writes.at(-1)?.state).toMatchObject({ connected: true, sendMode: 'steer', commands: true })
    expect(writes.at(-1)?.state).not.toHaveProperty('lastError')
    expect(calls).toEqual(['reconnect:mom', 'diagnose:mom', 'options:mom:{"sendMode":"steer"}'])
  })

  it('says the sub-plugin is outdated when it lacks the newer calls', async () => {
    const { service } = robot([])
    const { instance, writes } = link(service, 's-mom', { mom: bound })
    await instance.handle({ personId: 'mom', action: 'diagnose', nonce: 'd' })
    expect(writes.at(-1)?.state).toMatchObject({ status: 'bound', notice: REASONS.outdated })
  })

  it('mirrors status events into a bound state only', async () => {
    const { service } = robot([])
    const idle = link(service, 's-mom', { mom: { status: 'qr', qr: 'x', updatedAt: 1 } })
    await idle.instance.syncStatus('mom', { bound: true, connected: false })
    expect(idle.writes).toEqual([])
    const { instance, writes } = link(service, 's-mom', { mom: bound })
    await instance.syncStatus('mom', { bound: true, connected: false, lastError: '登录过期，请重新绑定' })
    expect(writes.at(-1)?.state).toMatchObject({ status: 'bound', connected: false, lastError: '登录过期，请重新绑定' })
  })

  it('acts on a nonce once, and not on the one stored before a restart', async () => {
    const { service, calls } = robot([{ status: 'expired', reason: '过期' }])
    const { instance } = link(service)
    instance.seen({ personId: 'mom', action: 'bind', nonce: 'old' })
    await instance.handle({ personId: 'mom', action: 'bind', nonce: 'old' })
    expect(calls).toEqual([])
    await instance.handle({ personId: 'mom', action: 'bind', nonce: 'n2' })
    await instance.handle({ personId: 'mom', action: 'bind', nonce: 'n2' })
    expect(calls).toEqual(['login:mom'])
  })

  it('fails in plain words without the robot or without a conversation', async () => {
    const missing = link(undefined)
    await missing.instance.handle({ personId: 'mom', action: 'bind', nonce: 'n' })
    expect(missing.writes[0]?.state).toEqual({ status: 'failed', reason: REASONS.noRobot, updatedAt: 42 })

    const { service, calls } = robot([{ status: 'bound', user: 'u' }])
    const early = link(service, null)
    await early.instance.handle({ personId: 'mom', action: 'bind', nonce: 'n' })
    expect(calls).toEqual(['login:mom', 'unbind:mom'])
    expect(early.writes[0]?.state?.reason).toBe(REASONS.noSession)
  })

  it('unbinds, cancels, and forgets', async () => {
    const { service, calls } = robot([])
    const { instance, writes } = link(service)
    await instance.handle({ personId: 'mom', action: 'unbind', nonce: 'a' })
    await instance.handle({ personId: 'mom', action: 'cancel', nonce: 'b' })
    await instance.forget('mom')
    expect(calls).toEqual(['unbind:mom', 'unbind:mom'])
    expect(writes.map(write => write.state?.status ?? null)).toEqual(['unbound', null, null])
  })

  it('turns a login error into a failed state', async () => {
    const service: ImRobotLike = {
      // eslint-disable-next-line require-yield
      async *login() { throw new Error('network') },
      bind: async () => undefined,
      unbind: async () => undefined,
      status: () => ({ bound: false }),
      setOptions: () => undefined,
    }
    const { instance, writes, warnings } = link(service)
    await instance.handle({ personId: 'mom', action: 'bind', nonce: 'x' })
    expect(writes[0]?.state?.reason).toBe(REASONS.unknown)
    expect(warnings).toHaveLength(1)
  })
})
