import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'
import { SettingsWriter, guarded, outsideTransactions, sendHostNote } from '../src/host/service.ts'

/** A settings service that refuses nested transactions the way the HMR service does. */
function hmrSettings() {
  const executing = new AsyncLocalStorage<boolean>()
  const store: Record<string, unknown> = {}
  const settings = {
    describe: () => [{ ns: 'dsh-assisstant' }],
    mutate: async (_ns: string, ops: readonly { path: readonly string[]; value: unknown }[]) => {
      if (executing.getStore()) throw new Error('HMR transactions cannot be nested')
      await executing.run(true, async () => { for (const op of ops) store[op.path[0] as string] = op.value })
    },
  }
  return { hmr: { executing }, settings, store, executing }
}

describe('the settings writer', () => {
  it('writes from inside a settings transaction by leaving its storage', async () => {
    const { hmr, settings, store, executing } = hmrSettings()
    const warnings: string[] = []
    const writer = new SettingsWriter(() => settings, 'dsh-assisstant', (message) => { warnings.push(message) }, outsideTransactions(hmr))
    await executing.run(true, () => writer.write(() => ({ people: [{ id: 'a' }] })))
    expect(store.people).toEqual([{ id: 'a' }])
    expect(warnings).toEqual([])
  })

  it('without the storage, reports the refusal after its retries', async () => {
    const { settings, executing } = hmrSettings()
    const warnings: string[] = []
    const writer = new SettingsWriter(() => settings, 'dsh-assisstant', (message) => { warnings.push(message) })
    const started = Date.now()
    await executing.run(true, () => writer.write(() => ({ people: [] })))
    expect(warnings).toHaveLength(1)
    expect(Date.now() - started).toBeGreaterThanOrEqual(4000)
  }, 10_000)

  it('replaces a field, so a key dropped from it goes away', async () => {
    const { settings, store } = hmrSettings()
    const writer = new SettingsWriter(() => settings, 'dsh-assisstant', () => undefined)
    await writer.write(() => ({ wechatState: { mom: { status: 'qr' }, dad: { status: 'bound' } } }))
    await writer.write(() => ({ wechatState: { dad: { status: 'bound' } } }))
    expect(store.wechatState).toEqual({ dad: { status: 'bound' } })
  })

  it('computes each patch at its turn and skips an empty one', async () => {
    const { settings, store } = hmrSettings()
    const writer = new SettingsWriter(() => settings, 'dsh-assisstant', () => undefined)
    let count = 0
    await Promise.all([
      writer.write(() => ({ count: ++count })),
      writer.write(() => undefined),
      writer.write(() => ({ count: ++count })),
    ])
    expect(store.count).toBe(2)
  })

  it('runs a plain call when there is no hmr service', () => {
    expect(outsideTransactions(undefined)(() => 7)).toBe(7)
  })
})

describe('host notes', () => {
  it('reach the agent as a turn of their own, under a source that is not a person', async () => {
    const sent: { id: string; role: string; content: unknown; source: unknown }[] = []
    const asked: string[] = []
    const controller = {
      resolveAgent: async (sessionId: string) => {
        asked.push(sessionId)
        return { agent: { followup: (message: never) => { sent.push(message) } } as never }
      },
    }
    await sendHostNote(controller, 's1', '提醒')
    await sendHostNote(controller, 's1', '提醒')
    expect(asked).toEqual(['s1', 's1'])
    expect(sent[0]).toMatchObject({ role: 'user', content: [{ type: 'text', text: '提醒' }], source: { kind: 'host-note', plugin: 'dsh-assisstant' } })
    expect(sent[0]?.id).not.toBe(sent[1]?.id)
  })

  it('fail when the session cannot be resumed', async () => {
    await expect(sendHostNote({ resolveAgent: async () => ({ error: new Error('gone') }) }, 's1', '提醒')).rejects.toThrow('gone')
  })
})

describe('guarded listeners', () => {
  it('keep a throw and a rejection inside, log the first of each listener, and pass results through', async () => {
    const warnings: string[] = []
    const warn = (message: string) => { warnings.push(message) }
    let calls = 0
    const throwing = guarded(warn, 'throwing', () => { calls += 1; throw new Error('boom') })
    expect(() => { throwing(); throwing() }).not.toThrow()
    expect(calls).toBe(2)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('throwing')
    expect(warnings[0]).toContain('boom')
    guarded(warn, 'rejecting', async () => { throw new Error('later') })()
    await new Promise(resolve => setTimeout(resolve, 1))
    expect(warnings[1]).toContain('later')
    let seen = 0
    guarded(warn, 'fine', (value: number) => { seen = value })(7)
    expect(seen).toBe(7)
    expect(warnings).toHaveLength(2)
  })
})
