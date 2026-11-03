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
import type { Context } from '@deepseek-ai/cordis';
declare const groupKey: unique symbol;
declare const init: unique symbol;
/** The part of `@deepseek-ai/dsh-app-boot` the group uses. */
interface AppBootLike {
    createRuntimeResolution(options: unknown): Promise<unknown>;
    loadProfileDirectory(label: string, dir: string, installAnchor: unknown): {
        layers: {
            packageName: string;
        }[];
    };
    resolveBundleDir(label: string, packageName: string, installAnchor: unknown, dir: string): string;
}
/** One child row of the group's config. */
interface ChildRow {
    readonly disabled?: unknown;
    readonly [key: string]: unknown;
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
export declare function childRows(config: unknown): ChildRow[];
/** @returns the sub-plugin packages: this package's dependencies. */
export declare function subplugins(): string[];
/**
 * Make every sub-plugin resolvable from the profile before the children load.
 * @param ctx - the group's context.
 * @param names - the sub-plugin packages.
 * @param boot - loads `@deepseek-ai/dsh-app-boot` (tests pass a fake).
 */
export declare function prepareResolution(ctx: {
    get(name: string): unknown;
}, names: readonly string[], boot?: () => Promise<AppBootLike>): Promise<void>;
/** The group row's plugin: prepare the resolution, then mount the children. */
export default class AssistantSubplugins {
    private readonly ctx;
    private readonly config;
    static inject: string[];
    static [groupKey]: boolean;
    constructor(ctx: Context, config: unknown);
    [init](): AsyncGenerator<() => void, void, unknown>;
}
export {};
