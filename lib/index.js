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
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { ASSISTANT_DEFAULTS, COMPACT_RATIO_RANGE, DEFAULTS, DEFAULT_WORKER_MODELS, MAX_BALANCE_CHECK_MINUTES, PLUGIN_ID, PRESET_ID, WORKER_PRESET_ID, assistantSettings, readPeople, readWorkerModels, readWechatRequest, readWechatStates } from "./shared/settings.js";
import { queryBalance } from "./host/balance.js";
import { TEMP_FOLDER } from "./host/assistant-tools.js";
import { processZone } from "./host/calendar.js";
import { Heartbeat, clearAutomationTasks } from "./host/heartbeat.js";
import { hidePreset } from "./host/hide-preset.js";
import { greetingText, introductionText, mergePeople, needingSessions, removedPeople } from "./host/people.js";
import { quietSpanAt } from "./host/quiet.js";
import { PROFILE_FILE, readProfileZone } from "./host/records/profile.js";
import { presetOf } from "./host/compat.js";
import { SettingsWriter, guarded, outsideTransactions, sendHostNote } from "./host/service.js";
import { TitlePin } from "./host/title.js";
import { WechatLink } from "./host/wechat-link.js";
import { Watchdog } from "./host/watchdog.js";
export const name = PLUGIN_ID;
export const inject = ['agents'];
export const Config = z.object({
    compactRatio: z.number().min(COMPACT_RATIO_RANGE.min).max(COMPACT_RATIO_RANGE.max).default(DEFAULTS.compactRatio)
        .description('Compact a conversation once its context reaches this share of the window').volatile(),
    workerModels: z.array(z.object({ provider: z.string().required(), model: z.string().required() })).default([...DEFAULT_WORKER_MODELS])
        .description('The models background workers may run; the assistant conversation picks one per task').volatile(),
    balanceThreshold: z.number().min(0).default(DEFAULTS.balanceThreshold)
        .description('Remind about recharging below this many yuan').volatile(),
    balanceCheckMinutes: z.natural().min(1).default(DEFAULTS.balanceCheckMinutes)
        .description('Minutes between balance checks').volatile(),
    balanceReminder: z.string().default(DEFAULTS.balanceReminder)
        .description('Reminder wording; {balance} and {threshold} are filled in').volatile(),
    personaSelfCorrect: z.boolean().default(DEFAULTS.personaSelfCorrect)
        .description('Let the assistant adjust its persona to each user').volatile(),
    personaCooldownHours: z.natural().default(DEFAULTS.personaCooldownHours)
        .description('Hours between two persona changes').volatile(),
    personaMaxChars: z.natural().min(200).default(DEFAULTS.personaMaxChars)
        .description('Longest persona.md the assistant keeps').volatile(),
    profileMaxChars: z.natural().min(500).default(DEFAULTS.profileMaxChars)
        .description('Longest profile.md the assistant keeps').volatile(),
    people: z.array(z.any()).default([]).description('The assistant list (managed by the assistant page)').volatile(),
    wechatRequest: z.any().description('The assistant page\'s latest WeChat request').volatile(),
    wechatState: z.dict(z.any()).default({}).description('WeChat binding states (written by the host)').volatile(),
});
/** A live config value, or undefined when `apply` was called without the loader. */
function live(value) {
    return value?.get();
}
/** @returns a finite number within bounds, else the fallback. */
function numberOr(value, fallback, min = -Infinity, max = Infinity) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}
/** @returns a non-empty string, else the fallback. */
function stringOr(value, fallback) {
    return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}
/** @returns a boolean, else the fallback. */
function booleanOr(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}
/**
 * Read the user-facing settings with defaults for anything missing.
 * @param config - the loaded config.
 * @returns plain values.
 */
export function readSettings(config) {
    return {
        compactRatio: numberOr(live(config?.compactRatio), DEFAULTS.compactRatio, COMPACT_RATIO_RANGE.min, COMPACT_RATIO_RANGE.max),
        workerModels: readWorkerModels(live(config?.workerModels)),
        balanceThreshold: numberOr(live(config?.balanceThreshold), DEFAULTS.balanceThreshold, 0),
        balanceCheckMinutes: numberOr(live(config?.balanceCheckMinutes), DEFAULTS.balanceCheckMinutes, 1, MAX_BALANCE_CHECK_MINUTES),
        balanceReminder: stringOr(live(config?.balanceReminder), DEFAULTS.balanceReminder),
        personaSelfCorrect: booleanOr(live(config?.personaSelfCorrect), DEFAULTS.personaSelfCorrect),
        personaCooldownHours: numberOr(live(config?.personaCooldownHours), DEFAULTS.personaCooldownHours, 0),
        personaMaxChars: numberOr(live(config?.personaMaxChars), DEFAULTS.personaMaxChars, 200),
        profileMaxChars: numberOr(live(config?.profileMaxChars), DEFAULTS.profileMaxChars, 500),
    };
}
/** @returns this plugin's data folder under the DSH home. */
export function dataDirectory() {
    return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'plugin-data', PLUGIN_ID);
}
/**
 * Wire the settings row.
 * @param ctx - the plugin context.
 * @param config - the loaded config.
 */
export function apply(ctx, config) {
    const host = ctx;
    const warn = (message) => { ctx.logger.warn(message); };
    /** Run work nobody awaits; what it rejects with is logged, never unhandled. */
    const background = (label, work) => { guarded(warn, label, work)(); };
    const settings = () => readSettings(config);
    const storedPeople = () => readPeople(live(config?.people));
    const writer = new SettingsWriter(() => host.get('settings'), PLUGIN_ID, warn, run => outsideTransactions(host.get('hmr'))(run));
    let people = storedPeople();
    let balance = { status: 'unknown', checkedAt: 0 };
    const inputs = new Map();
    /** Sessions whose running turn holds a message from the user. */
    const userTurns = new Set();
    /** Sessions whose next turn may reach the user in quiet hours: a wake-up they asked for, or their own new binding. */
    const quietPasses = new Set();
    const readText = (path) => {
        try {
            return readFileSync(path, 'utf8');
        }
        catch {
            return undefined;
        }
    };
    const zoneOfFolder = (cwd) => (cwd === undefined ? undefined : readProfileZone(readText(join(cwd, PROFILE_FILE)))) ?? processZone();
    const chatConnected = (person) => assistantSettings(person).wechatEnabled
        && readWechatStates(live(config?.wechatState))[person.id]?.status === 'bound'
        && typeof host.get('imRobot')?.send === 'function';
    /** Send to the chat app, logging instead of throwing; false when it could not go out. */
    const sendNow = (person, text) => {
        try {
            const robot = host.get('imRobot');
            if (robot?.send === undefined)
                return false;
            robot.send(person.id, text);
            return true;
        }
        catch (error) {
            warn(`could not send to the chat app of ${person.name}: ${String(error)}`);
            return false;
        }
    };
    const refreshBalance = async () => {
        balance = await queryBalance({
            account: host.get('deepseekAccount'),
            credentials: host.get('credentials'),
        });
        return balance;
    };
    const service = {
        settings,
        people: () => people,
        personForSession: sessionId => people.find(person => person.sessionId === sessionId),
        balance: () => balance,
        refreshBalance,
        lastInput: sessionId => inputs.get(sessionId) ?? 'web',
        markInput: (sessionId, channel) => { inputs.set(sessionId, channel); },
        zoneFor: session => zoneOfFolder(session === undefined ? undefined : service.personForSession(session.id)?.cwd ?? session.header.cwd),
        chatConnected,
        sendToChat: (person, sessionId, text) => {
            if (!chatConnected(person))
                return { status: 'unavailable' };
            const quiet = quietSpanAt(assistantSettings(person), Date.now(), zoneOfFolder(person.cwd));
            if (quiet !== undefined && !userTurns.has(sessionId) && !quietPasses.has(sessionId)) {
                heartbeat.hold(person.id, text);
                return { status: 'held', until: quiet.end };
            }
            return sendNow(person, text) ? { status: 'sent' } : { status: 'unavailable' };
        },
        turnFromUser: sessionId => userTurns.has(sessionId),
        wakes: person => heartbeat.wakes(person.id),
        addWake: (person, wake) => heartbeat.addWake(person.id, wake),
        cancelWakes: (person, match) => heartbeat.cancelWakes(person.id, match),
        updateSettings: (personId, patch) => writer.write(() => {
            let changed = false;
            const merged = storedPeople().map((person) => {
                if (person.id !== personId)
                    return person;
                changed = true;
                const next = { ...person.settings, ...patch };
                for (const [key, value] of Object.entries(next)) {
                    // Only what differs from the defaults is stored.
                    if (value === undefined || ASSISTANT_DEFAULTS[key] === value)
                        delete next[key];
                }
                const { settings: _old, ...rest } = person;
                return { ...rest, ...(Object.keys(next).length === 0 ? {} : { settings: next }) };
            });
            return changed ? { people: merged } : undefined;
        }),
    };
    ctx.provide('dshAssisstant', service);
    ctx.inject(['agentPresets'], (scope) => {
        const restore = hidePreset(scope.agentPresets, [PRESET_ID, WORKER_PRESET_ID]);
        if (restore === undefined)
            warn('the preset registry has no list() to wrap, so the user preset stays visible in the preset pickers');
        else
            scope.effect(() => restore);
    });
    const presetOfSession = (session) => presetOf({ agentPresets: host.get('agentPresets'), sessionProjections: host.get('sessionProjections') }, session);
    // ---- the models ----
    const pushWorkerModels = () => {
        host.get('completeSubagent')?.setChildModels(settings().workerModels);
    };
    ctx.inject(['completeSubagent'], () => { pushWorkerModels(); });
    // ---- the conversation's title: its assistant's name ----
    const titles = new TitlePin({
        titles: () => host.get('sessionTitle'),
        nameOf: sessionId => service.personForSession(sessionId)?.name,
        warn,
    });
    const assistantRoot = (session) => session.header.parentSession === undefined && presetOfSession(session) === PRESET_ID;
    const retitle = () => {
        for (const agent of host.get('agents').list()) {
            if (assistantRoot(agent.session))
                titles.apply(agent.session);
        }
    };
    host.on('agent/created', guarded(warn, 'title', ({ agent }) => {
        if (assistantRoot(agent.session))
            queueMicrotask(() => { titles.apply(agent.session); });
    }));
    // ---- the assistant list ----
    const creating = new Set();
    const reconcile = async () => {
        const controller = host.get('sessionController');
        if (controller === undefined)
            return;
        for (const person of needingSessions(people)) {
            if (creating.has(person.id))
                continue;
            creating.add(person.id);
            try {
                const { sessionId } = await controller.create({ cwd: person.cwd, agentPreset: PRESET_ID });
                await writer.write(() => {
                    const merged = mergePeople(storedPeople(), new Map([[person.id, { sessionId }]]));
                    return merged === undefined ? undefined : { people: merged };
                });
                note(sessionId, greetingText(person));
            }
            catch (error) {
                warn(`could not create the conversation for ${person.name}: ${String(error)}`);
            }
            finally {
                creating.delete(person.id);
            }
        }
    };
    // ---- WeChat ----
    const writeState = (personId, state) => writer.write(() => {
        const states = { ...readWechatStates(live(config?.wechatState)) };
        if (state === null) {
            if (!(personId in states))
                return undefined;
            delete states[personId];
        }
        else {
            states[personId] = state;
        }
        return { wechatState: states };
    });
    const link = new WechatLink({
        robot: () => host.get('imRobot'),
        people: () => people,
        writeState,
        readState: personId => readWechatStates(live(config?.wechatState))[personId],
        warn,
        bound: (personId, sessionId) => {
            const person = people.find(entry => entry.id === personId);
            if (person !== undefined)
                background('WeChat options', () => host.get('imRobot')?.setBindingOptions?.(person.id, robotOptions(person)));
            quietPasses.add(sessionId);
            note(sessionId, introductionText());
        },
    });
    link.seen(readWechatRequest(live(config?.wechatRequest)));
    ctx.effect(() => () => link.dispose());
    /** @returns what im-robot should know about one assistant's account. */
    const robotOptions = (person) => {
        const { wechatEnabled, wechatReplyMaxChars } = assistantSettings(person);
        return {
            enabled: wechatEnabled,
            replyMaxChars: wechatReplyMaxChars,
            ...(person.cwd === undefined ? {} : { mediaDir: join(person.cwd, TEMP_FOLDER) }),
        };
    };
    /** Give each bound account its assistant's options; an account not logged in has none to change. */
    const pushRobotOptions = () => {
        const robot = host.get('imRobot');
        const states = readWechatStates(live(config?.wechatState));
        for (const person of people) {
            if (states[person.id]?.status !== 'bound')
                continue;
            background('WeChat options', () => robot?.setBindingOptions?.(person.id, robotOptions(person)));
        }
    };
    ctx.inject(['imRobot'], () => { pushRobotOptions(); });
    host.on('im-robot/inbound', guarded(warn, 'WeChat input', (sessionId) => { service.markInput(sessionId, 'wechat'); }));
    host.on('im-robot/status', guarded(warn, 'WeChat status', (bindingId, status) => link.syncStatus(bindingId, status)));
    // A QR code or a scan in progress cannot survive a restart.
    background('QR code expiry', () => writer.write(() => {
        const states = readWechatStates(live(config?.wechatState));
        let changed = false;
        for (const [personId, state] of Object.entries(states)) {
            if (state.status !== 'qr' && state.status !== 'scanned')
                continue;
            states[personId] = { status: 'expired', reason: '二维码已过期，请重新绑定。', updatedAt: Date.now() };
            changed = true;
        }
        return changed ? { wechatState: states } : undefined;
    }));
    // ---- system notes, the watchdog, and the heartbeat ----
    const note = (sessionId, text) => {
        const controller = host.get('sessionController');
        if (controller === undefined)
            return;
        sendHostNote(controller, sessionId, text).catch((error) => { warn(`could not send a system note to ${sessionId}: ${String(error)}`); });
    };
    const watchdog = new Watchdog({
        now: Date.now,
        stallMs: router => assistantSettings(service.personForSession(router)).watchdogStallMinutes * 60_000,
        cancel: (sessionId) => {
            try {
                host.get('sessionController')?.cancel({ sessionId });
            }
            catch (error) {
                warn(`the watchdog could not stop ${sessionId}: ${String(error)}`);
            }
        },
        notify: note,
    });
    host.on('session/event', guarded(warn, 'session event', (session, event) => {
        const preset = presetOfSession(session);
        if (preset === PRESET_ID)
            watchdog.observe(session.id, 'router', session.id, event.type);
        else if (preset === WORKER_PRESET_ID) {
            const parent = session.header.parentSession;
            watchdog.observe(session.id, 'worker', parent === undefined ? session.id : watchdog.routerOf(parent), event.type);
        }
        if (preset === PRESET_ID && event.type === 'session/title' && session.header.parentSession === undefined) {
            titles.observe(session, event.data);
        }
        if (preset === PRESET_ID && event.type === 'user/message') {
            const source = event.data?.source;
            if (typeof source?.clientTimeZone === 'string')
                service.markInput(session.id, 'web');
            if (source?.kind === 'user')
                userTurns.add(session.id);
        }
        if (preset === PRESET_ID && event.type === 'turn/start')
            userTurns.delete(session.id);
        if (preset === PRESET_ID && event.type === 'turn/end') {
            userTurns.delete(session.id);
            quietPasses.delete(session.id);
        }
    }));
    const heartbeat = new Heartbeat({
        now: Date.now,
        people: () => people,
        zoneFor: person => zoneOfFolder(person.cwd),
        read: readText,
        running: sessionId => host.get('agents').get(sessionId)?.status === 'running',
        chatConnected,
        sendNote: (sessionId, text) => {
            const person = service.personForSession(sessionId);
            // A wake-up that came through quiet hours may reach the user in them, once.
            if (person !== undefined && quietSpanAt(assistantSettings(person), Date.now(), zoneOfFolder(person.cwd)) !== undefined)
                quietPasses.add(sessionId);
            note(sessionId, text);
        },
        sendHeld: sendNow,
        warn,
        directory: join(dataDirectory(), 'heartbeat'),
    });
    const minute = setInterval(guarded(warn, 'minute timer', () => {
        watchdog.tick();
        heartbeat.tick();
    }), 60_000);
    minute.unref?.();
    ctx.effect(() => () => clearInterval(minute));
    // ---- what earlier versions left among the host's automation tasks ----
    ctx.inject(['schedule'], () => {
        background('automation task clean-up', async () => {
            const schedule = host.get('schedule');
            if (schedule === undefined)
                return;
            for (const person of people) {
                if (person.sessionId !== undefined)
                    await clearAutomationTasks(schedule, person.sessionId);
            }
        });
    });
    // ---- the balance ----
    let timer;
    let minutes = 0;
    const schedule = () => {
        const next = settings().balanceCheckMinutes;
        if (next === minutes && timer !== undefined)
            return;
        minutes = next;
        if (timer !== undefined)
            clearInterval(timer);
        timer = setInterval(guarded(warn, 'balance timer', refreshBalance), minutes * 60_000);
        timer.unref?.();
    };
    ctx.effect(() => () => { if (timer !== undefined)
        clearInterval(timer); });
    schedule();
    ctx.inject(['deepseekAccount'], () => { background('balance', refreshBalance); });
    background('balance', refreshBalance);
    // ---- reacting to settings changes ----
    host.on('loader/volatile-update', guarded(warn, 'settings update', () => {
        const next = storedPeople();
        for (const person of removedPeople(people, next)) {
            background('WeChat unbinding', () => link.forget(person.id));
            heartbeat.forget(person.id);
            if (person.sessionId !== undefined)
                watchdog.forget(person.sessionId);
        }
        const moved = next.filter(person => assistantSettings(person).sandboxMode !== assistantSettings(people.find(entry => entry.id === person.id)).sandboxMode);
        people = next;
        for (const person of moved) {
            const session = person.sessionId === undefined ? undefined : host.get('agents').get(person.sessionId)?.session;
            session?.append('sandbox/mode', { mode: assistantSettings(person).sandboxMode });
        }
        pushWorkerModels();
        retitle();
        background('assistant list', reconcile);
        background('WeChat request', () => link.handle(readWechatRequest(live(config?.wechatRequest))));
        pushRobotOptions();
        schedule();
    }));
    ctx.inject(['sessionController', 'settings'], () => { background('assistant list', reconcile); });
}
