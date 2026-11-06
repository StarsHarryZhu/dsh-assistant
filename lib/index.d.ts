/**
 * dsh-assisstant settings row (top level, so the settings page can edit it).
 *
 * Owns every setting and the assistant list, and provides the `dshAssisstant`
 * service the preset's plugins read. It also:
 *
 * - hides the `dsh-assisstant` preset from every preset list;
 * - creates each new user's conversation (a session on the hidden
 *   preset in their folder) and writes it back into the assistant list;
 * - tells complete-subagent which models workers may run;
 * - titles each assistant conversation with its assistant's name;
 * - polls the RMB balance of the DeepSeek account;
 * - runs the page's WeChat requests against the im-robot sub-plugin and
 *   stores each binding state for the page to draw;
 * - runs each assistant's heartbeat, and removes the automation tasks earlier
 *   versions left in the host.
 * @module dsh-assisstant
 */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { WorkerModel } from './shared/settings.ts';
import type { SharedSettings } from './host/service.ts';
export type { AssistantService, SharedSettings, InputChannel } from './host/service.ts';
export declare const name = "dsh-assisstant";
export declare const inject: string[];
export interface Config {
    compactRatio: Volatile<number>;
    workerModels: Volatile<WorkerModel[]>;
    balanceThreshold: Volatile<number>;
    balanceCheckMinutes: Volatile<number>;
    balanceReminder: Volatile<string>;
    personaSelfCorrect: Volatile<boolean>;
    personaCooldownHours: Volatile<number>;
    personaMaxChars: Volatile<number>;
    profileMaxChars: Volatile<number>;
    people: Volatile<unknown[]>;
    wechatRequest: Volatile<unknown>;
    wechatState: Volatile<Record<string, unknown>>;
}
export declare const Config: z<Config>;
/**
 * Read the user-facing settings with defaults for anything missing.
 * @param config - the loaded config.
 * @returns plain values.
 */
export declare function readSettings(config: Partial<Config> | undefined): SharedSettings;
/** @returns this plugin's data folder under the DSH home. */
export declare function dataDirectory(): string;
/**
 * Wire the settings row.
 * @param ctx - the plugin context.
 * @param config - the loaded config.
 */
export declare function apply(ctx: Context, config: Config): void;
