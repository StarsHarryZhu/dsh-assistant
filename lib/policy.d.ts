/**
 * dsh-assisstant policy, mounted once in each hidden preset.
 *
 * `role: router` (the `dsh-assisstant` preset, each family member's own
 * conversation):
 * - router.md as the whole system prompt;
 * - contexts: the calendar, the workspace (who it is, profile, persona,
 *   projects), this week's schedule parsed from `ddl.md`, the balance
 *   reminder, the WeChat reply rule when the latest input came from WeChat, and
 *   the permission when it is not the default;
 * - the permission pin (the sandbox mode the assistant's IM tab chose, never
 *   ask); the model and effort are whatever the composer chose for this
 *   conversation;
 * - only complete-subagent's delegation and review tools among global tools;
 * - the record tools, the `balance_check` tool, and the `/ddl` command, which
 *   prints the week view itself.
 *
 * `role: worker` (the `dsh-assisstant-worker` preset every `delegate` child
 * runs on): worker.md, the calendar and workspace contexts, the record tools
 * but the profile's and persona's, and only `request_write_access` among
 * global tools.
 * @module dsh-assisstant/policy
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { AssistantService } from './host/service.ts';
import type { SandboxMode } from './shared/settings.ts';
import type { AssemblyLike, PresentationLike } from './host/types.ts';
export declare const name = "dsh-assisstant-policy";
export declare const inject: string[];
/** Which preset this instance serves. */
export type Role = 'router' | 'worker';
export interface Config {
    role: Role;
}
export declare const Config: z<Config>;
/** Global tools each role keeps (all of them complete-subagent's). */
export declare const ALLOWED_TOOLS: Record<Role, readonly string[]>;
/** The prompt section name of each role, which the assemble hook keys on. */
export declare const SECTION: Record<Role, string>;
/**
 * Keep only this role's section: the prompt is complete, so persona or
 * instruction sections another plugin adds globally stay out.
 * @param assembly - the presentation after the downstream hooks.
 * @param role - this instance's role.
 * @returns the presentation with only this role's section.
 */
export declare function settleSections<T extends PresentationLike>(assembly: T, role: Role): T;
/** @returns the router's text for the low-balance reminder, or an empty string. */
export declare function balanceText(service: AssistantService): string;
/** @returns what the router must know when an assistant's permission is not the default the prompt assumes. */
export declare function permissionText(mode: SandboxMode): string;
/** @returns the WeChat reply rule when the latest input came from WeChat, else an empty string. */
export declare function channelText(service: AssistantService, sessionId: string): string;
/**
 * Apply the policy.
 * @param ctx - the preset-scoped plugin context.
 * @param config - this row's role.
 */
export declare function apply(ctx: Context, config: Config): void;
/** Kept for tests that assemble a prompt without an agent. */
export type { AssemblyLike };
