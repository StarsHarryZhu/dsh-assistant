/**
 * Keep the hidden presets out of every preset list while leaving it usable.
 *
 * The registry's roster (`remoteExportList`, which the new-session picker and
 * the settings section read) calls `this.list()`, while `resolve`, `mount`,
 * and resume read the definitions directly. Wrapping `list` on the registry's
 * prototype therefore hides the preset from people and from nothing else.
 * The wrap is a property of the loaded plugin: disposing restores the
 * original, and a second wrap of the same prototype stacks cleanly.
 * @module dsh-assisstant/host/hide-preset
 */

import type { PresetRowLike } from './types.ts'

/** A registry whose prototype carries `list`. */
interface ListingRegistry {
  list(): Promise<readonly PresetRowLike[]>
}

/**
 * Hide preset ids from `list()`.
 * @param registry - the `agentPresets` service (a cordis proxy is fine).
 * @param presetIds - the presets to hide.
 * @returns the restore function, or undefined when the registry has no prototype `list`.
 */
export function hidePreset(registry: ListingRegistry, presetIds: readonly string[]): (() => void) | undefined {
  const proto = Object.getPrototypeOf(registry) as ListingRegistry | null
  if (proto === null || typeof proto.list !== 'function') return undefined
  const original = proto.list
  const hidden = new Set(presetIds)
  const wrapped = async function (this: ListingRegistry): Promise<readonly PresetRowLike[]> {
    const rows = await original.call(this)
    return rows.filter(row => !hidden.has(row.id))
  }
  proto.list = wrapped
  return () => {
    // Restore only if nothing wrapped on top of us since; otherwise leave the
    // newer wrap in place (it captured ours and keeps calling through it).
    if (proto.list === wrapped) proto.list = original
  }
}
