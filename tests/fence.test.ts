import { describe, expect, it } from 'vitest'
import { hidePreset } from '../src/host/hide-preset.ts'
import { createToolFence } from '../src/host/tool-fence.ts'
import { FakeTools } from './helpers.ts'

describe('hiding the presets', () => {
  class Registry {
    async list() { return [{ id: 'standard' }, { id: 'dsh-assisstant' }, { id: 'dsh-assisstant-worker' }] }
    async resolve(id: string) { return { id } }
  }

  it('drops the hidden ids from list() through the prototype and restores it', async () => {
    const registry = new Registry()
    const restore = hidePreset(registry, ['dsh-assisstant', 'dsh-assisstant-worker'])
    expect((await registry.list()).map(row => row.id)).toEqual(['standard'])
    expect((await new Registry().list()).map(row => row.id)).toEqual(['standard'])
    expect(await registry.resolve('dsh-assisstant')).toEqual({ id: 'dsh-assisstant' })
    restore?.()
    expect((await registry.list()).map(row => row.id)).toHaveLength(3)
  })

  it('leaves a newer wrap in place on restore', async () => {
    const registry = new Registry()
    const restore = hidePreset(registry, ['dsh-assisstant'])
    const proto = Object.getPrototypeOf(registry) as Registry
    const ours = proto.list
    proto.list = async function () { return (await ours.call(this)).slice(0, 1) }
    restore?.()
    expect((await registry.list()).map(row => row.id)).toEqual(['standard'])
    proto.list = Registry.prototype.list
  })

  it('reports a registry without list()', () => {
    expect(hidePreset(Object.create(null) as never, ['x'])).toBeUndefined()
  })
})

describe('the tool fence', () => {
  it('denies every global tool except the allowlist and follows registry changes', () => {
    const tools = new FakeTools()
    for (const name of ['delegate', 'ui_render', 'working_directory']) tools.globals.add(name)
    const fence = createToolFence(tools, ['delegate', 'answer_write_request'])
    tools.onChange = () => { fence.refresh() }
    expect(tools.visibleGlobals()).toEqual(['delegate'])
    expect(fence.denied()).toEqual(['ui_render', 'working_directory'])

    tools.globals.add('late_global')
    fence.refresh()
    expect(tools.visibleGlobals()).toEqual(['delegate'])
    expect(tools.restrictions).toHaveLength(1)

    fence.refresh()
    expect(tools.restrictions).toHaveLength(1)
    fence.dispose()
    expect(tools.restrictions).toHaveLength(0)
  })

  it('applies no restriction when only allowed tools exist', () => {
    const tools = new FakeTools()
    tools.globals.add('delegate')
    createToolFence(tools, ['delegate'])
    expect(tools.restrictions).toHaveLength(0)
  })
})
