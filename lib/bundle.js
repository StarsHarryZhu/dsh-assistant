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
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGE_NAME } from "./shared/settings.js";
const groupKey = Symbol.for('cordis.group');
const init = Symbol.for('cordis.init');
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
export function childRows(config) {
    const rows = Array.isArray(config) ? config : [];
    return rows.map((row) => {
        if (row.disabled !== true)
            return row;
        const { disabled: _stale, ...rest } = row;
        return rest;
    });
}
/** @returns the sub-plugin packages: this package's dependencies. */
export function subplugins() {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return Object.keys(manifest.dependencies ?? {});
}
/**
 * Make every sub-plugin resolvable from the profile before the children load.
 * @param ctx - the group's context.
 * @param names - the sub-plugin packages.
 * @param boot - loads `@deepseek-ai/dsh-app-boot` (tests pass a fake).
 */
export async function prepareResolution(ctx, names, boot = () => import(__rewriteRelativeImportExtension('@deepseek-ai/dsh-app-boot'))) {
    const packages = ctx.get('pluginPackages');
    const profile = ctx.get('profileContext');
    if (packages === undefined || profile === undefined || typeof packages.replace !== 'function')
        return;
    const parent = pathToFileURL(join(profile.dir, 'package.json')).href;
    if (names.every(name => packages.packageOf(name, parent) !== undefined))
        return;
    const { createRuntimeResolution, loadProfileDirectory, resolveBundleDir } = await boot();
    const selected = loadProfileDirectory(PACKAGE_NAME, profile.dir, profile.installAnchor);
    if (!selected.layers.some(layer => layer.packageName === PACKAGE_NAME))
        return;
    const layers = [
        ...profile.startedBundles.map(packageName => ({
            packageName,
            packageDir: resolveBundleDir(PACKAGE_NAME, packageName, profile.installAnchor, profile.dir),
            patchPaths: [],
            patches: [],
        })),
        ...selected.layers.filter(layer => !profile.startedBundles.includes(layer.packageName)),
    ];
    packages.replace(await createRuntimeResolution({
        installAnchor: profile.installAnchor,
        profile: { ...selected, layers },
        home: profile.home,
    }));
}
/** The group row's plugin: prepare the resolution, then mount the children. */
export default class AssistantSubplugins {
    ctx;
    config;
    static inject = ['loader'];
    static [groupKey] = true;
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
    }
    async *[init]() {
        await prepareResolution(this.ctx, subplugins());
        const Group = this.ctx.loader?.builtins?.group;
        if (typeof Group !== 'function')
            throw new Error(`${PACKAGE_NAME}/bundle needs the Loader's cordis:group builtin`);
        const rows = childRows(this.config);
        const group = new Group(this.ctx, rows);
        yield () => group.stop();
        await group.update(rows);
    }
}
