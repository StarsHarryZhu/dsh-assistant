/**
 * The bridge between the page's WeChat requests and the im-robot service.
 *
 * The page writes a request into the settings row (`wechatRequest`, a new
 * nonce each time); this class runs it against `imRobot` and reports every
 * state back through `writeState`, which the page reads to draw the QR code
 * and the binding status. A person's binding id is their person id.
 * @module dsh-assisstant/host/wechat-link
 */
import type { Person, WechatRequest, WechatState } from '../shared/settings.ts';
import type { ImBindingStatus, ImRobotLike } from './types.ts';
/** What the link needs from the plugin. */
export interface WechatLinkDeps {
    /** The im-robot service, or undefined while the sub-plugin is off. */
    robot(): ImRobotLike | undefined;
    /** The current assistant list. */
    people(): readonly Person[];
    /** Store one person's state; null removes it. */
    writeState(personId: string, state: WechatState | null): Promise<void>;
    /** One person's stored state. */
    readState(personId: string): WechatState | undefined;
    /** Report an unexpected failure. */
    warn(message: string): void;
    now?(): number;
}
/** Plain-language reasons shown on the page. */
export declare const REASONS: {
    readonly noRobot: "微信组件没有加载，请在插件页确认 im-robot 已启用。";
    readonly noSession: "这位家人的对话还没建好，请稍等几秒再绑定。";
    readonly unknown: "绑定没有成功，请再试一次。";
    readonly outdated: "微信组件版本太旧，不支持这个操作，请更新 im-robot。";
    readonly failed: "操作没有成功，请再试一次。";
};
/** Runs WeChat requests, one login at a time per person. */
export declare class WechatLink {
    private readonly deps;
    private readonly logins;
    private lastNonce;
    constructor(deps: WechatLinkDeps);
    private now;
    /**
     * Treat a request as already handled: the one stored before a restart must
     * not start a new login when the plugin loads.
     * @param request - the stored request, if any.
     */
    seen(request: WechatRequest | undefined): void;
    /**
     * Act on a request once; a repeated nonce is ignored.
     * @param request - the stored request.
     * @returns a promise for tests; callers need not await it.
     */
    handle(request: WechatRequest | undefined): Promise<void>;
    /**
     * Mirror an `im-robot/status` event into a bound person's stored state;
     * other states (a login in progress, unbound) are left alone.
     */
    syncStatus(personId: string, status: ImBindingStatus): Promise<void>;
    /** Merge fields into a bound person's state, keeping what the page already shows. */
    private merge;
    /**
     * Run one of im-robot's newer per-binding operations and merge its result.
     * @param personId - the binding.
     * @param run - the operation, or undefined when im-robot does not offer it.
     * @param label - for the warning when it throws.
     */
    private operate;
    /** Restart a binding's connection now. */
    private reconnect;
    /** Check a binding's connection and store the outcome. */
    private diagnose;
    /** Change a binding's send mode or command handling. */
    private setOptions;
    /** Abort a running login for one person. */
    private stopLogin;
    /** Run a QR login and bind the person's conversation when it succeeds. */
    private bind;
    /** Remove a person's binding. */
    unbind(personId: string): Promise<void>;
    /** Forget a removed person entirely: binding, credentials, and stored state. */
    forget(personId: string): Promise<void>;
    /** Abort every running login. */
    dispose(): void;
}
