/**
 * dsh-assisstant compactor, mounted inside the router preset's
 * compaction group (where the `compaction` service is isolated). After every
 * turn of an assistant conversation it compacts once the context reaches the
 * configured share of the window; the group's own compaction-basic stays as
 * the in-turn safety net at a higher ratio.
 * @module dsh-assisstant/compactor
 */
import type { Context } from '@deepseek-ai/cordis';
import type { PressureLike } from './host/compat.ts';
export declare const name = "dsh-assisstant-compactor";
export declare const inject: string[];
/**
 * Whether a session is due for compaction.
 * @param pressure - the token meter's reading.
 * @param ratio - the configured share of the window.
 * @returns true at or above the share.
 */
export declare function due(pressure: PressureLike, ratio: number): boolean;
/**
 * Compact after turns.
 * @param ctx - the plugin context inside the compaction group.
 */
export declare function apply(ctx: Context): void;
