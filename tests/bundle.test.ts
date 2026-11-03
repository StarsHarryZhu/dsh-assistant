import { describe, expect, it } from 'vitest'
import AssistantSubplugins, { childRows, prepareResolution, subplugins } from '../src/bundle.ts'

const profile = { dir: '/p/web', home: '/p', installAnchor: { kind: 'anchor' }, startedBundles: ['@deepseek-ai/dsh-base', 'dsh-assisstant'] }

function fakeBoot() {
  const calls: unknown[] = []
  return {
    calls,
    boot: async () => ({
      createRuntimeResolution: async (options: unknown) => { calls.push(options); return { resolution: true } },
      loadProfileDirectory: () => ({ layers: [{ packageName: '@deepseek-ai/dsh-base' }, { packageName: 'dsh-assisstant' }, { packageName: 'extra' }] }),
      resolveBundleDir: (_label: string, name: string) => `/dirs/${name}`,
    }),
  }
}

describe('the sub-plugin group', () => {
  it('reads the sub-plugins from the package dependencies', () => {
    expect(subplugins()).toEqual(['complete-subagent', 'im-robot'])
  })

  it('leaves the resolution alone when every sub-plugin resolves', async () => {
    const replaced: unknown[] = []
    const { calls, boot } = fakeBoot()
    const ctx = { get: (name: string) => (name === 'profileContext' ? profile : { packageOf: () => ({}), replace: (value: unknown) => { replaced.push(value) } }) }
    await prepareResolution(ctx, ['complete-subagent', 'im-robot'], boot)
    expect(calls).toEqual([])
    expect(replaced).toEqual([])
  })

  it('rebuilds the resolution when a sub-plugin does not resolve', async () => {
    const replaced: unknown[] = []
    const { calls, boot } = fakeBoot()
    const packages = { packageOf: (name: string) => (name === 'im-robot' ? undefined : {}), replace: (value: unknown) => { replaced.push(value) } }
    const ctx = { get: (name: string) => (name === 'profileContext' ? profile : packages) }
    await prepareResolution(ctx, ['complete-subagent', 'im-robot'], boot)
    expect(replaced).toEqual([{ resolution: true }])
    const layers = (calls[0] as { profile: { layers: { packageName: string; packageDir?: string }[] } }).profile.layers
    expect(layers.map(layer => layer.packageName)).toEqual(['@deepseek-ai/dsh-base', 'dsh-assisstant', 'extra'])
    expect(layers[0]?.packageDir).toBe('/dirs/@deepseek-ai/dsh-base')
  })

  it('does nothing without a profile', async () => {
    const { calls, boot } = fakeBoot()
    await prepareResolution({ get: () => undefined }, ['im-robot'], boot)
    expect(calls).toEqual([])
  })

  it('drops a written-back literal disabled and keeps the guard expression', () => {
    const expression = { __jsExpr: "[...loader.entries()].some(e => e.options.id === 'im-robot')" }
    const rows = [
      { id: 'dsh-assisstant-complete-subagent', name: 'complete-subagent', disabled: true, config: { presets: ['dsh-assisstant'] } },
      { id: 'dsh-assisstant-im-robot', name: 'im-robot', disabled: expression, config: {} },
      { id: 'plain', name: 'x', disabled: false },
    ]
    expect(childRows(rows)).toEqual([
      { id: 'dsh-assisstant-complete-subagent', name: 'complete-subagent', config: { presets: ['dsh-assisstant'] } },
      { id: 'dsh-assisstant-im-robot', name: 'im-robot', disabled: expression, config: {} },
      { id: 'plain', name: 'x', disabled: false },
    ])
    expect(childRows(undefined)).toEqual([])
  })

  it('mounts the children with the Loader group and stops it on dispose', async () => {
    const events: string[] = []
    class Group {
      constructor(_ctx: unknown, readonly config: unknown) { events.push('new') }
      update(config: unknown) { events.push(`update:${JSON.stringify(config)}`) }
      stop() { events.push('stop') }
    }
    const ctx = { get: () => undefined, loader: { builtins: { group: Group } } }
    const plugin = new AssistantSubplugins(ctx as never, [{ id: 'child' }])
    const run = plugin[Symbol.for('cordis.init') as never] as unknown as () => AsyncGenerator<() => void>
    const generator = run.call(plugin)
    const first = await generator.next()
    expect(events).toEqual(['new'])
    await generator.next()
    expect(events).toEqual(['new', 'update:[{"id":"child"}]'])
    ;(first.value as () => void)()
    expect(events.at(-1)).toBe('stop')
    expect((AssistantSubplugins as unknown as Record<symbol, unknown>)[Symbol.for('cordis.group')]).toBe(true)
  })
})
