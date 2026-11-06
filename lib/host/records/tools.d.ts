/**
 * The record tools: quick reads and writes of fixed files in one user's
 * workspace, in the same turn and without a worker. They register in
 * the two hidden presets' scope only, so no other session ever sees them.
 * Results are plain text for the model; a failure is a normal result it can act on.
 * @module dsh-assisstant/host/records/tools
 */
import type { DdlEntry } from '../ddl.ts';
import type { SharedSettings } from '../service.ts';
import type { AssistantSettings } from '../../shared/settings.ts';
import type { AgentLike } from '../types.ts';
import type { RecordStore } from './store.ts';
/** Which user a call acts for. */
export interface RecordTarget {
    readonly store: RecordStore;
    readonly zone: string;
    /** The assistant's own settings: the reminder lead and the quiet hours. */
    readonly assistant: Pick<AssistantSettings, 'reminderLeadMinutes' | 'quietStart' | 'quietEnd' | 'tempQuietFrom' | 'tempQuietUntil'>;
}
/** What the tools need from the policy. */
export interface RecordToolDeps {
    target(agent: AgentLike | undefined): RecordTarget | undefined;
    settings(): SharedSettings;
}
/** Tools only the assistant conversation has: what it knows about them, and how it talks. */
export declare const ROUTER_ONLY_TOOLS: readonly string[];
/**
 * What the reminder of an item will be, for a tool's result: the heartbeat gives
 * it by reading the file, so nothing is set up here.
 * @param entry - the item as stored.
 * @param target - the assistant's zone and settings.
 * @param now - the current instant.
 * @returns a sentence, or an empty string when the item takes no reminder.
 */
export declare function reminderSentence(entry: DdlEntry, target: Pick<RecordTarget, 'zone' | 'assistant'>, now: number): string;
/**
 * Build the tools a role has.
 * @param role - `router` has all nine; `worker` has all but the profile and persona.
 * @param deps - the target, settings, and reminder service.
 * @returns tool definitions to register in the preset's scope.
 */
export declare function recordTools(role: 'router' | 'worker', deps: RecordToolDeps): unknown[];
