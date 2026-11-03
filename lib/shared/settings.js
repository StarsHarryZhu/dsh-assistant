/**
 * Identities, defaults, and the data shapes both halves read from the settings
 * row: the assistant list, WeChat binding requests, and WeChat binding states.
 * The settings row is also the channel between the halves (the page writes a
 * request, the host writes the outcome back), so every reader here accepts
 * anything and keeps only well-formed entries.
 * @module dsh-assisstant/shared/settings
 */
/** The npm package name: the browser bundle's registration id and the Plugins page key for this bundle. */
export const PACKAGE_NAME = '@starsharryzhu/dsh-assistant';
/**
 * This plugin's internal id: the settings namespace (the profile row's id),
 * the browser half's locale key, and its data folder. It keeps the package's
 * original spelling so settings, presets, and data written by earlier local
 * installs stay where they are after the package was renamed.
 */
export const PLUGIN_ID = 'dsh-assisstant';
/** The hidden router preset: each family member's own conversation. */
export const PRESET_ID = 'dsh-assisstant';
/** The hidden worker preset every `delegate` child of an assistant conversation runs on. */
export const WORKER_PRESET_ID = 'dsh-assisstant-worker';
/** The left-sidebar row and main panel id. */
export const PANEL_ID = 'dsh-assisstant';
/** Default values of the settings every assistant shares (the Plugins page). */
export const DEFAULTS = {
    compactRatio: 0.5,
    balanceThreshold: 10,
    balanceCheckMinutes: 120,
    balanceReminder: '温馨提示：账户余额只剩 {balance} 元了（低于 {threshold} 元）。',
    personaSelfCorrect: true,
    personaCooldownHours: 24,
    personaMaxChars: 2000,
    profileMaxChars: 6000,
};
/** The models workers may run until the user chooses others. */
export const DEFAULT_WORKER_MODELS = [{ provider: 'deepseek-account', model: 'deepseek-flash' }];
/** Default values of the settings each assistant has for itself (its settings tab). */
/** What an assistant's workers may change, in the host's sandbox modes. */
export const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'];
export const ASSISTANT_DEFAULTS = {
    sandboxMode: 'workspace-write',
    reminderLeadMinutes: 30,
    dailyBriefTime: '08:00',
    watchdogStallMinutes: 10,
    wechatEnabled: true,
    wechatReplyMaxChars: 100,
};
/** The shortest WeChat message the settings allow (im-robot's own minimum). */
export const MIN_WECHAT_REPLY_CHARS = 10;
/** The shortest stall the watchdog acts on, in minutes. */
export const MIN_WATCHDOG_MINUTES = 2;
/** Bounds of the compaction ratio setting. */
export const COMPACT_RATIO_RANGE = { min: 0.3, max: 0.85 };
/** The longest balance check interval: a week, well below what a timer can hold. */
export const MAX_BALANCE_CHECK_MINUTES = 10_080;
/** What the page can ask the host to do with one person's WeChat. */
export const WECHAT_ACTIONS = ['bind', 'unbind', 'cancel', 'reconnect', 'diagnose', 'options'];
/** Settings fields only the page and the host use; the settings page hides them. */
export const INTERNAL_FIELDS = ['people', 'wechatRequest', 'wechatState'];
/** @returns the value as a non-empty trimmed string, or undefined. */
function text(value) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
/**
 * Read the assistant list.
 * @param value - the stored `people` value.
 * @returns well-formed people in stored order, first entry winning on a duplicate id.
 */
export function readPeople(value) {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    const people = [];
    for (const entry of value) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const record = entry;
        const id = text(record.id);
        const name = text(record.name);
        if (id === undefined || name === undefined || seen.has(id))
            continue;
        seen.add(id);
        const address = text(record.address);
        const cwd = text(record.cwd);
        const sessionId = text(record.sessionId);
        const settings = readAssistantSettings(record.settings);
        people.push({
            id,
            name,
            ...(address === undefined ? {} : { address }),
            ...(cwd === undefined ? {} : { cwd }),
            ...(sessionId === undefined ? {} : { sessionId }),
            ...(settings === undefined ? {} : { settings }),
        });
    }
    return people;
}
/** @returns the integer when it is at least `min`, else undefined. */
function atLeast(value, min) {
    return typeof value === 'number' && Number.isInteger(value) && value >= min ? value : undefined;
}
/**
 * Read an assistant's stored settings.
 * @param value - the stored `settings` of one assistant list entry.
 * @returns the well-formed fields, or undefined when none is.
 */
export function readAssistantSettings(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const record = value;
    const fields = {
        ...fieldOf('sandboxMode', SANDBOX_MODES.includes(record.sandboxMode) ? record.sandboxMode : undefined),
        ...fieldOf('reminderLeadMinutes', atLeast(record.reminderLeadMinutes, 0)),
        ...fieldOf('dailyBriefTime', typeof record.dailyBriefTime === 'string' ? record.dailyBriefTime.trim() : undefined),
        ...fieldOf('watchdogStallMinutes', atLeast(record.watchdogStallMinutes, MIN_WATCHDOG_MINUTES)),
        ...fieldOf('wechatEnabled', typeof record.wechatEnabled === 'boolean' ? record.wechatEnabled : undefined),
        ...fieldOf('wechatReplyMaxChars', atLeast(record.wechatReplyMaxChars, MIN_WECHAT_REPLY_CHARS)),
    };
    return Object.keys(fields).length === 0 ? undefined : fields;
}
/** @returns the one-field object, or an empty one when the value is missing. */
function fieldOf(key, value) {
    return value === undefined ? {} : { [key]: value };
}
/**
 * One assistant's settings with defaults for what it never changed.
 * @param person - the assistant; undefined gives the defaults.
 * @returns every field.
 */
export function assistantSettings(person) {
    return { ...ASSISTANT_DEFAULTS, ...person?.settings };
}
/**
 * Read the models workers may run.
 * @param value - the stored `workerModels` value.
 * @returns the well-formed models without repeats; the defaults when none is left, since a worker must run something.
 */
export function readWorkerModels(value) {
    const seen = new Set();
    const models = [];
    for (const entry of Array.isArray(value) ? value : []) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const provider = text(entry.provider);
        const model = text(entry.model);
        if (provider === undefined || model === undefined || seen.has(`${provider}/${model}`))
            continue;
        seen.add(`${provider}/${model}`);
        models.push({ provider, model });
    }
    return models.length === 0 ? [...DEFAULT_WORKER_MODELS] : models;
}
/**
 * Read the pending WeChat request.
 * @param value - the stored `wechatRequest` value.
 * @returns the request, or undefined when there is none or it is malformed.
 */
export function readWechatRequest(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const record = value;
    const personId = text(record.personId);
    const nonce = text(record.nonce);
    const action = record.action;
    if (personId === undefined || nonce === undefined)
        return undefined;
    if (!WECHAT_ACTIONS.includes(action))
        return undefined;
    const options = readWechatOptions(record.options);
    return { personId, action: action, nonce, ...(options === undefined ? {} : { options }) };
}
/** @returns the well-formed options, or undefined when none is. */
export function readWechatOptions(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const record = value;
    const sendMode = record.sendMode === 'queue' || record.sendMode === 'steer' ? record.sendMode : undefined;
    const commands = typeof record.commands === 'boolean' ? record.commands : undefined;
    if (sendMode === undefined && commands === undefined)
        return undefined;
    return { ...(sendMode === undefined ? {} : { sendMode }), ...(commands === undefined ? {} : { commands }) };
}
/** @returns the well-formed diagnosis, or undefined. */
function readDiagnosis(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const record = value;
    if (typeof record.ok !== 'boolean' || typeof record.at !== 'number' || !Array.isArray(record.checks))
        return undefined;
    const checks = [];
    for (const entry of record.checks) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const check = entry;
        const label = text(check.label);
        if (label === undefined || typeof check.ok !== 'boolean')
            continue;
        const detail = text(check.detail);
        checks.push({ label, ok: check.ok, ...(detail === undefined ? {} : { detail }) });
    }
    return { ok: record.ok, checks, at: record.at };
}
const STATUSES = new Set(['qr', 'scanned', 'bound', 'expired', 'failed', 'unbound']);
/**
 * Read every person's WeChat state.
 * @param value - the stored `wechatState` value.
 * @returns person id → well-formed state.
 */
export function readWechatStates(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return {};
    const states = {};
    for (const [personId, entry] of Object.entries(value)) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const record = entry;
        const status = record.status;
        if (!STATUSES.has(status))
            continue;
        const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : 0;
        const qr = text(record.qr);
        const user = text(record.user);
        const reason = text(record.reason);
        const expiresAt = typeof record.expiresAt === 'number' ? record.expiresAt : undefined;
        const lastError = text(record.lastError);
        const notice = text(record.notice);
        const options = readWechatOptions(record);
        const diagnosis = readDiagnosis(record.diagnosis);
        states[personId] = {
            status,
            updatedAt,
            ...(qr === undefined ? {} : { qr }),
            ...(expiresAt === undefined ? {} : { expiresAt }),
            ...(user === undefined ? {} : { user }),
            ...(reason === undefined ? {} : { reason }),
            ...(typeof record.connected === 'boolean' ? { connected: record.connected } : {}),
            ...(lastError === undefined ? {} : { lastError }),
            ...options,
            ...(diagnosis === undefined ? {} : { diagnosis }),
            ...(notice === undefined ? {} : { notice }),
        };
    }
    return states;
}
/**
 * A folder name for a person: their name with characters no file system
 * accepts replaced by "-".
 * @param name - the person's name.
 * @returns a single path segment, never empty and never "." or "..".
 */
export function folderName(name) {
    const cleaned = name.replace(/[/\\:*?"<>|\u0000-\u001F]/gu, '-').trim();
    return cleaned === '' || cleaned === '.' || cleaned === '..' ? 'family' : cleaned;
}
