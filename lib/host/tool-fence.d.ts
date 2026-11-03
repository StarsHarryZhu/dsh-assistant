/**
 * Keep other plugins' global tools out of the assistant agents.
 *
 * The policy plugin is mounted once for the preset, and a restriction in its
 * scope applies to every agent composed from the preset. It must be a deny
 * list: tools registered by the preset's own rows are inherited by an agent
 * scope, so an allow list would mask them too (seen in the 2026-11-01 probe,
 * where `allow: []` left the agent with no tools at all). The deny list is
 * every global tool except the allowlist, recomputed whenever the tool
 * registry changes. The list comes from `schemas()`, which every supported host
 * has (`definitions()` only since 0.2.2-alpha.2); `run_code` can be in it, and
 * `restrict` refuses to name it.
 * @module dsh-assisstant/host/tool-fence
 */
import type { ToolsLike } from './types.ts';
/** A live fence. */
export interface ToolFence {
    /** Recompute the deny list and swap the restriction when it changed. */
    refresh(): void;
    /** The tools currently denied. */
    denied(): readonly string[];
    /** Lift the restriction. */
    dispose(): void;
}
/**
 * Create the fence and apply it once.
 * @param tools - the preset-scoped tools service.
 * @param allowed - global tools the assistant agents keep.
 * @returns the fence.
 */
export declare function createToolFence(tools: ToolsLike, allowed: readonly string[]): ToolFence;
