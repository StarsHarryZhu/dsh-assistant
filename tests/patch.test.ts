import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown> & {
  dependencies: Record<string, string>
  engines: Record<string, string>
  exports: Record<string, unknown>
  dsh: { bundle: { patch: string }; client: { platform: string; inject: string[] } }
}

/** The patch text from one row's `- id:` line to the next top-level row. */
function row(id: string): string {
  const start = patch.indexOf(`    - id: ${id}\n`)
  expect(start, `row ${id}`).toBeGreaterThanOrEqual(0)
  const next = patch.indexOf('\n    - id: ', start + 1)
  return next < 0 ? patch.slice(start) : patch.slice(start, next + 1)
}

describe('the bundle patch', () => {
  it('inserts the settings row, the sub-plugin group, and the two hidden presets', () => {
    expect([...patch.matchAll(/^ {4}- id: (\S+)$/gmu)].map(match => match[1])).toEqual([
      'dsh-assisstant', 'dsh-assisstant-subplugins', 'preset-dsh-assisstant', 'preset-dsh-assisstant-worker',
    ])
    expect(row('dsh-assisstant')).toContain('name: dsh-assisstant\n')
  })

  it('mounts every dependency in the group, limited to the family presets and guarded against a standalone copy', () => {
    const group = row('dsh-assisstant-subplugins')
    expect(group).toContain('name: dsh-assisstant/bundle')
    expect(group).toContain('group: true')
    for (const name of Object.keys(manifest.dependencies)) {
      expect(group).toContain(`name: ${name}\n`)
      expect(group).toContain(`e.options.id === '${name}' && !e.options.disabled`)
    }
    expect(group).toContain('presets: [dsh-assisstant, dsh-assisstant-worker]')
    expect(group).toContain('childPreset: dsh-assisstant-worker')
    expect(group).toContain('ownModel: false')
    expect(group).toContain('presets: [dsh-assisstant]')
  })

  it('gives the router no writes, no shell, no web, no skills, and no official subagent tool', () => {
    const router = row('preset-dsh-assisstant')
    expect(router).toContain('id: dsh-assisstant\n')
    for (const absent of ['dsh-tool-bash', 'dsh-tool-web', 'dsh-skill-filesystem', 'dsh-tool-skill', 'dsh-tool-subagent\'', 'dsh-tool-ask-user', 'dsh-persona']) {
      expect(router).not.toContain(absent)
    }
    expect(router).toMatch(/dsh-tool-fs'\n {12}config:\n {14}write: false\n {14}edit: false/u)
    expect(router).toContain('name: dsh-assisstant/compactor')
    expect(router).toContain('role: router')
  })

  it('gives the worker the working tools with a 5-second shell', () => {
    const worker = row('preset-dsh-assisstant-worker')
    expect(worker).toContain('id: dsh-assisstant-worker\n')
    expect(worker).toMatch(/dsh-bash-sandbox'\n {16}config:\n {18}timeoutMs: 5000/u)
    expect(worker).toContain('waitTimeoutMs: 5000')
    expect(worker).toContain('dsh-tool-web')
    expect(worker).toContain('role: worker')
    expect(worker).not.toContain('dsh-tool-subagent')
  })
})

describe('the manifest', () => {
  it('pins the identity, the engine range, and the entries', () => {
    expect(manifest.name).toBe('dsh-assisstant')
    expect(manifest.version).toBe('0.1.0')
    expect(manifest.license).toBe('MIT')
    expect(manifest.engines.dsh).toBe('>=0.2.1-rc.5 <0.3.0-0')
    expect(Object.keys(manifest.exports)).toEqual(expect.arrayContaining(['.', './bundle', './policy', './compactor', './client']))
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
  })

  it('pins every sub-plugin to an exact version', () => {
    expect(Object.keys(manifest.dependencies).sort()).toEqual(['complete-subagent', 'im-robot'])
    for (const version of Object.values(manifest.dependencies)) expect(version).toMatch(/^\d+\.\d+\.\d+$/u)
  })

  it('names its titles in both languages', () => {
    const zh = JSON.parse(readFileSync(join(ROOT, 'locale', 'zh.json'), 'utf8')) as { meta: { title: string } }
    const en = JSON.parse(readFileSync(join(ROOT, 'locale', 'en.json'), 'utf8')) as { meta: { title: string } }
    expect(zh.meta.title).toBe('助理')
    expect(en.meta.title).toBe('Assistant')
  })
})
