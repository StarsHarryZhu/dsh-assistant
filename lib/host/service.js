/**
 * The `dshAssisstant` service the settings row provides to the preset's
 * plugins (policy and compactor), plus the serialized settings writer the row
 * uses to store what the host finds out.
 * @module dsh-assisstant/host/service
 */
import { randomUUID } from 'node:crypto';
import { PLUGIN_ID } from "../shared/settings.js";
/**
 * Wrap a host event listener so a failure in it stays in this plugin. Many of
 * these fire for every session of the host, so what escapes one can make every
 * conversation unusable. Each listener logs its first failure only.
 * @param warn - where the failure goes.
 * @param label - what the listener is, for the log.
 * @param listener - the listener, which may be async.
 * @returns the listener, never throwing or rejecting.
 */
export function guarded(warn, label, listener) {
    let reported = false;
    const report = (error) => {
        if (reported)
            return;
        reported = true;
        warn(`the ${label} listener failed and is skipped for this event: ${String(error)}`);
    };
    return (...args) => {
        try {
            const result = listener(...args);
            if (result instanceof Promise)
                result.catch(report);
        }
        catch (error) {
            report(error);
        }
    };
}
/**
 * Send a host note into an assistant conversation as a turn of its own, resuming a
 * cold session. Its source is not `user`, so the host's conversation view draws
 * one folded notice instead of the user's own words, and session
 * titles ignore it; im-robot counts the turn as a follow-up and pushes the
 * answer to WeChat.
 * @param controller - the session controller.
 * @param sessionId - the assistant conversation.
 * @param text - the note.
 */
export async function sendHostNote(controller, sessionId, text) {
    const result = await controller.resolveAgent(sessionId);
    if ('error' in result)
        throw result.error;
    const note = { id: randomUUID(), role: 'user', content: [{ type: 'text', text }], source: { kind: 'host-note', plugin: PLUGIN_ID } };
    result.agent.followup(note);
}
/**
 * Run a call outside the host's settings transaction.
 *
 * Settings updates run in the HMR service's exclusive transactions, which
 * refuse to nest; the "inside a transaction" flag is an AsyncLocalStorage, so
 * every async continuation started by a settings change (this plugin's
 * reaction to a new user, a WeChat login that a request started)
 * still carries it. Leaving that storage lets the write queue behind the open
 * transaction instead of failing.
 * @param hmr - the `hmr` service, if present.
 * @returns a runner; a plain call when the service or its storage is absent.
 */
export function outsideTransactions(hmr) {
    const storage = hmr?.executing;
    const exit = storage?.exit;
    if (typeof exit !== 'function')
        return run => run();
    return run => exit.call(storage, run);
}
/** Retries of a write refused because a settings transaction is still open. */
const MAX_NESTED_RETRIES = 50;
/** Delay between those retries, in milliseconds. */
const NESTED_RETRY_MS = 100;
/**
 * Writes to this plugin's settings row one at a time, each patch computed
 * from the stored values at its turn, so the host never overwrites a change
 * the page made in between.
 */
export class SettingsWriter {
    settings;
    namespace;
    warn;
    outside;
    queue = Promise.resolve();
    /**
     * @param settings - the settings service, read at write time.
     * @param namespace - this plugin's settings namespace.
     * @param warn - reports a write that failed for good.
     * @param outside - runs a call outside any open settings transaction (see `outsideTransactions`).
     */
    constructor(settings, namespace, warn, outside = run => run()) {
        this.settings = settings;
        this.namespace = namespace;
        this.warn = warn;
        this.outside = outside;
    }
    /** The settings namespace of the row: its id, as `describe()` lists it. */
    ns(settings) {
        const forms = settings.describe();
        return forms.find(form => form.ns === this.namespace)?.ns
            ?? forms.find(form => form.ns.endsWith(this.namespace))?.ns
            ?? this.namespace;
    }
    /**
     * Queue one write. Each field replaces what is stored: `settings.update`
     * merges plain objects recursively, so a key dropped from one would stay.
     * @param patch - computes the fields to set from the stored values at write time, or undefined to skip.
     * @returns a promise that settles when this write is done.
     */
    write(patch) {
        const run = async () => {
            // A write that a settings change set off runs while that change's
            // transaction is still open, and the host refuses nested transactions:
            // wait for it to close, recomputing the patch from the latest values.
            for (let attempt = 0;; attempt += 1) {
                const settings = this.settings();
                if (settings === undefined)
                    return;
                const fields = patch();
                if (fields === undefined)
                    return;
                try {
                    const ns = this.ns(settings);
                    const ops = Object.entries(fields).map(([key, value]) => ({ op: 'set', path: [key], value }));
                    await this.outside(() => settings.mutate(ns, ops));
                    return;
                }
                catch (error) {
                    if (/cannot be nested/u.test(String(error)) && attempt < MAX_NESTED_RETRIES) {
                        await new Promise(resolve => setTimeout(resolve, NESTED_RETRY_MS));
                        continue;
                    }
                    this.warn(`could not store ${Object.keys(fields).join(', ')}: ${String(error)}`);
                    return;
                }
            }
        };
        const next = this.queue.then(run, run);
        this.queue = next.catch(() => undefined);
        return next;
    }
}
