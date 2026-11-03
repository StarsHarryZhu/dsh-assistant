/**
 * dsh-assisstant sub-plugin group (the `dsh-assisstant-subplugins` row).
 *
 * The same shape as dsh-mnemon's group row, written independently: the
 * sub-plugins are npm packages in this package's `dependencies`, so a fresh
 * profile has them installed but not necessarily in its runtime resolution
 * (for example when the bundle is enabled without a restart). Before mounting
 * the children with the Loader's own `cordis:group`, the group makes sure each
 * sub-plugin resolves from the profile, and rebuilds the resolution through
 * `@deepseek-ai/dsh-app-boot` when one does not.
 * @module dsh-assisstant/bundle
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { PACKAGE_NAME } from './shared/settings.ts'

const groupKey = Symbol.for('cordis.group')
const init = Symbol.for('cordis.init')

/** `ctx.pluginPackages`: the runtime package resolution. */
interface PluginPackagesLike {
  packageOf(name: string, parent: string): unknown
  replace(resolution: unknown): void
}

/** `ctx.profileContext`: the running profile. */
interface ProfileContextLike {
  readonly dir: string
  readonly home: string
  readonly installAnchor: unknown
  readonly startedBundles: readonly string[]
}

/** The part of `@deepseek-ai/dsh-app-boot` the group uses. */
interface AppBootLike {
  createRuntimeResolution(options: unknown): Promise<unknown>
  loadProfileDirectory(label: string, dir: string, installAnchor: unknown): { layers: { packageName: string }[] }
  resolveBundleDir(label: string, packageName: string, installAnchor: unknown, dir: string): string
}

/** One child row of the group's config. */
interface ChildRow {
  readonly disabled?: unknown
  readonly [key: string]: unknown
}

/**
 * Drop a child's literal `disabled: true`. The patch gives each child an
 * expression (switch off when the same plugin also runs standalone), which
 * the Loader evaluates at every mount decision; a profile that writes its
 * composed tree back into its root file can store that expression's value as
 * a fixed `true`, which would keep the sub-plugin off for good. The patch never
 * sets a literal, so a literal is always such a leftover.
 * @param config - the group's child rows.
 * @returns the rows to mount.
 */
export function childRows(config: unknown): ChildRow[] {
  const rows = Array.isArray(config) ? config as ChildRow[] : []
  return rows.map((row) => {
    if (row.disabled !== true) return row
    const { disabled: _stale, ...rest } = row
    return rest
  })
}

/** The Loader's group builtin. */
interface GroupLike {
  update(config: unknown): Promise<void> | void
  stop(): void
}

/** @returns the sub-plugin packages: this package's dependencies. */
export function subplugins(): string[] {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> }
  return Object.keys(manifest.dependencies ?? {})
}

/**
 * Make every sub-plugin resolvable from the profile before the children load.
 * @param ctx - the group's context.
 * @param names - the sub-plugin packages.
 * @param boot - loads `@deepseek-ai/dsh-app-boot` (tests pass a fake).
 */
export async function prepareResolution(
  ctx: { get(name: string): unknown },
  names: readonly string[],
  boot: () => Promise<AppBootLike> = () => import('@deepseek-ai/dsh-app-boot' as string) as Promise<AppBootLike>,
): Promise<void> {
  const packages = ctx.get('pluginPackages') as PluginPackagesLike | undefined
  const profile = ctx.get('profileContext') as ProfileContextLike | undefined
  if (packages === undefined || profile === undefined || typeof packages.replace !== 'function') return
  const parent = pathToFileURL(join(profile.dir, 'package.json')).href
  if (names.every(name => packages.packageOf(name, parent) !== undefined)) return
  const { createRuntimeResolution, loadProfileDirectory, resolveBundleDir } = await boot()
  const selected = loadProfileDirectory(PACKAGE_NAME, profile.dir, profile.installAnchor)
  if (!selected.layers.some(layer => layer.packageName === PACKAGE_NAME)) return
  const layers = [
    ...profile.startedBundles.map(packageName => ({
      packageName,
      packageDir: resolveBundleDir(PACKAGE_NAME, packageName, profile.installAnchor, profile.dir),
      patchPaths: [],
      patches: [],
    })),
    ...selected.layers.filter(layer => !profile.startedBundles.includes(layer.packageName)),
  ]
  packages.replace(await createRuntimeResolution({
    installAnchor: profile.installAnchor,
    profile: { ...selected, layers },
    home: profile.home,
  }))
}

/** The group row's plugin: prepare the resolution, then mount the children. */
export default class AssistantSubplugins {
  static inject = ['loader']
  static [groupKey] = true

  constructor(private readonly ctx: Context, private readonly config: unknown) {}

  async *[init](): AsyncGenerator<() => void, void, unknown> {
    await prepareResolution(this.ctx as unknown as { get(name: string): unknown }, subplugins())
    const Group = (this.ctx as unknown as { loader?: { builtins?: { group?: new (ctx: Context, config: unknown) => GroupLike } } }).loader?.builtins?.group
    if (typeof Group !== 'function') throw new Error(`${PACKAGE_NAME}/bundle needs the Loader's cordis:group builtin`)
    const rows = childRows(this.config)
    const group = new Group(this.ctx, rows)
    yield () => group.stop()
    await group.update(rows)
  }
}
