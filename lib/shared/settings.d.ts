/**
 * Identities, defaults, and the data shapes both halves read from the settings
 * row: the assistant list, WeChat binding requests, and WeChat binding states.
 * The settings row is also the channel between the halves (the page writes a
 * request, the host writes the outcome back), so every reader here accepts
 * anything and keeps only well-formed entries.
 * @module dsh-assisstant/shared/settings
 */
/** The npm package name: the browser bundle's registration id and the Plugins page key for this bundle. */
export declare const PACKAGE_NAME = "@starsharryzhu/dsh-assistant";
/**
 * This plugin's internal id: the settings namespace (the profile row's id),
 * the browser half's locale key, and its data folder. It keeps the package's
 * original spelling so settings, presets, and data written by earlier local
 * installs stay where they are after the package was renamed.
 */
export declare const PLUGIN_ID = "dsh-assisstant";
/** The hidden router preset: each user's own conversation. */
export declare const PRESET_ID = "dsh-assisstant";
/** The hidden worker preset every `delegate` child of an assistant conversation runs on. */
export declare const WORKER_PRESET_ID = "dsh-assisstant-worker";
/** The left-sidebar row and main panel id. */
export declare const PANEL_ID = "dsh-assisstant";
/** Default values of the settings every assistant shares (the Plugins page). */
export declare const DEFAULTS: {
    readonly compactRatio: 0.5;
    readonly balanceThreshold: 10;
    readonly balanceCheckMinutes: 120;
    readonly balanceReminder: "温馨提示：账户余额只剩 {balance} 元了（低于 {threshold} 元）。";
    readonly personaSelfCorrect: true;
    readonly personaCooldownHours: 24;
    readonly personaMaxChars: 2000;
    readonly profileMaxChars: 6000;
};
/** One model workers may run. */
export interface WorkerModel {
    readonly provider: string;
    readonly model: string;
}
/** The models workers may run until the user chooses others. */
export declare const DEFAULT_WORKER_MODELS: readonly WorkerModel[];
/** Default values of the settings each assistant has for itself (its settings tab). */
/** What an assistant's workers may change, in the host's sandbox modes. */
export declare const SANDBOX_MODES: readonly ["read-only", "workspace-write", "danger-full-access"];
/** One of `SANDBOX_MODES`. */
export type SandboxMode = typeof SANDBOX_MODES[number];
export declare const ASSISTANT_DEFAULTS: {
    readonly sandboxMode: "workspace-write";
    readonly reminderLeadMinutes: 30;
    readonly dailyBriefTime: "08:00";
    readonly watchdogStallMinutes: 10;
    readonly wechatEnabled: true;
    readonly wechatReplyMaxChars: 100;
};
/** The settings each assistant has for itself. */
export interface AssistantSettings {
    /** What this assistant's workers may change; picked in its IM tab. */
    readonly sandboxMode: SandboxMode;
    readonly reminderLeadMinutes: number;
    /** `HH:MM` local time of the daily brief, or an empty string when it is off. */
    readonly dailyBriefTime: string;
    readonly watchdogStallMinutes: number;
    readonly wechatEnabled: boolean;
    readonly wechatReplyMaxChars: number;
}
/** The shortest WeChat message the settings allow (im-robot's own minimum). */
export declare const MIN_WECHAT_REPLY_CHARS = 10;
/** The shortest stall the watchdog acts on, in minutes. */
export declare const MIN_WATCHDOG_MINUTES = 2;
/** Bounds of the compaction ratio setting. */
export declare const COMPACT_RATIO_RANGE: {
    readonly min: 0.3;
    readonly max: 0.85;
};
/** The longest balance check interval: a week, well below what a timer can hold. */
export declare const MAX_BALANCE_CHECK_MINUTES = 10080;
/**
 * One assistant: the user it serves sets it up on the page with a
 * name, what it should call them, and a workspace folder holding its one
 * conversation.
 */
export interface Person {
    /** Stable id chosen by the page; also the WeChat binding id. */
    readonly id: string;
    /** The assistant's name, shown on its tab. */
    readonly name: string;
    /** What the assistant calls its user; absent when they left it empty. */
    readonly address?: string;
    /** A local label for the bound WeChat account, shown in the IM tab. */
    /** Absolute workspace folder, chosen when the assistant is created. */
    readonly cwd?: string;
    /** The person's conversation; the host creates it and writes it back. */
    readonly sessionId?: string;
    /** What this assistant changed from `ASSISTANT_DEFAULTS`. */
    readonly settings?: Partial<AssistantSettings>;
}
/** How a binding hands a message to a conversation that is still working: wait in line, or join the running turn. */
export type WechatSendMode = 'queue' | 'steer';
/** The per-binding options the IM tab edits. */
export interface WechatOptions {
    readonly sendMode?: WechatSendMode;
    /** Whether a WeChat message starting with `/` runs as a command. */
    readonly commands?: boolean;
}
/** What the page can ask the host to do with one person's WeChat. */
export declare const WECHAT_ACTIONS: readonly ["bind", "unbind", "cancel", "reconnect", "diagnose", "options"];
/** A WeChat request the page writes; a new nonce makes the host act again. */
export interface WechatRequest {
    readonly personId: string;
    readonly action: (typeof WECHAT_ACTIONS)[number];
    readonly nonce: string;
    /** The options to apply, with `action: 'options'`. */
    readonly options?: WechatOptions;
}
/** One step of a connection diagnosis, in plain Chinese. */
export interface WechatCheck {
    readonly label: string;
    readonly ok: boolean;
    readonly detail?: string;
}
/** One person's WeChat binding as the host reports it. */
export interface WechatState {
    readonly status: 'qr' | 'scanned' | 'bound' | 'expired' | 'failed' | 'unbound';
    /** Text to encode as the QR code, while `status` is `qr`. */
    readonly qr?: string;
    /** When the QR code stops working, epoch milliseconds. */
    readonly expiresAt?: number;
    /** Masked WeChat user id once bound. */
    readonly user?: string;
    /** Plain-language reason for `expired` or `failed`. */
    readonly reason?: string;
    /** While bound: whether messages are being received. */
    readonly connected?: boolean;
    /** While bound: the latest unresolved problem, in plain Chinese. */
    readonly lastError?: string;
    readonly sendMode?: WechatSendMode;
    readonly commands?: boolean;
    /** The latest diagnosis. */
    readonly diagnosis?: {
        readonly ok: boolean;
        readonly checks: readonly WechatCheck[];
        readonly at: number;
    };
    /** Why the latest reconnect, diagnosis, or option change could not run. */
    readonly notice?: string;
    /** When the host wrote this state, epoch milliseconds. */
    readonly updatedAt: number;
}
/** Settings fields only the page and the host use; the settings page hides them. */
export declare const INTERNAL_FIELDS: readonly ["people", "wechatRequest", "wechatState"];
/**
 * Read the assistant list.
 * @param value - the stored `people` value.
 * @returns well-formed people in stored order, first entry winning on a duplicate id.
 */
export declare function readPeople(value: unknown): Person[];
/**
 * Read an assistant's stored settings.
 * @param value - the stored `settings` of one assistant list entry.
 * @returns the well-formed fields, or undefined when none is.
 */
export declare function readAssistantSettings(value: unknown): Partial<AssistantSettings> | undefined;
/**
 * One assistant's settings with defaults for what it never changed.
 * @param person - the assistant; undefined gives the defaults.
 * @returns every field.
 */
export declare function assistantSettings(person: Pick<Person, 'settings'> | undefined): AssistantSettings;
/**
 * Read the models workers may run.
 * @param value - the stored `workerModels` value.
 * @returns the well-formed models without repeats; the defaults when none is left, since a worker must run something.
 */
export declare function readWorkerModels(value: unknown): WorkerModel[];
/**
 * Read the pending WeChat request.
 * @param value - the stored `wechatRequest` value.
 * @returns the request, or undefined when there is none or it is malformed.
 */
export declare function readWechatRequest(value: unknown): WechatRequest | undefined;
/** @returns the well-formed options, or undefined when none is. */
export declare function readWechatOptions(value: unknown): WechatOptions | undefined;
/**
 * Read every person's WeChat state.
 * @param value - the stored `wechatState` value.
 * @returns person id → well-formed state.
 */
export declare function readWechatStates(value: unknown): Record<string, WechatState>;
/**
 * A folder name for a person: their name with characters no file system
 * accepts replaced by "-".
 * @param name - the person's name.
 * @returns a single path segment, never empty and never "." or "..".
 */
export declare function folderName(name: string): string;
