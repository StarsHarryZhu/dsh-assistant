/**
 * The record tools: quick reads and writes of fixed files in one family
 * member's workspace, in the same turn and without a worker. They register in
 * the two hidden presets' scope only, so no other session ever sees them.
 * Results are plain text for the model; a failure is a normal result it can act on.
 * @module dsh-assisstant/host/records/tools
 */
import type { SharedSettings } from '../service.ts';
import type { AgentLike, ScheduleLike } from '../types.ts';
import type { RecordStore } from './store.ts';
/** Which family member a call acts for. */
export interface RecordTarget {
    readonly store: RecordStore;
    readonly zone: string;
    /** The assistant conversation, which owns the reminders. */
    readonly sessionId: string;
    /** How long before a timed event its reminder fires, for this assistant. */
    readonly leadMinutes: number;
}
/** What the tools need from the policy. */
export interface RecordToolDeps {
    target(agent: AgentLike | undefined): RecordTarget | undefined;
    settings(): SharedSettings;
    schedule(): ScheduleLike | undefined;
}
/** Tools only the assistant conversation has: what it knows about them, and how it talks. */
export declare const ROUTER_ONLY_TOOLS: readonly string[];
/**
 * Build the tools a role has.
 * @param role - `router` has all nine; `worker` has all but the profile and persona.
 * @param deps - the target, settings, and reminder service.
 * @returns tool definitions to register in the preset's scope.
 */
export declare function recordTools(role: 'router' | 'worker', deps: RecordToolDeps): unknown[];
