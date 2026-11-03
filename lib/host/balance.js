/**
 * The RMB balance of the DeepSeek account, and the reminder the model appends
 * when it runs low. Each conversation picks its own model, so the balance is
 * the household's, not one conversation's: the logged-in account, else the
 * official API key. A failed query is "unknown", and an unknown balance never
 * produces a reminder.
 * @module dsh-assisstant/host/balance
 */
/** The official API's balance endpoint. */
export const OFFICIAL_BALANCE_URL = 'https://api.deepseek.com/user/balance';
/** Credential reference of the official API key. */
const API_KEY_REF = 'DEEPSEEK_API_KEY';
/** @returns the decimal string as a finite number, or undefined. */
function amount(value) {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    return Number.isFinite(number) ? number : undefined;
}
/**
 * Sum the CNY recharge and bonus wallets of a DeepSeek account.
 * @param balance - `deepseekAccount.getBalance()`'s answer.
 * @returns yuan, or undefined when the query failed or no CNY wallet exists.
 */
export function accountYuan(balance) {
    if (balance === null || balance === undefined || balance.status !== 'ready')
        return undefined;
    const wallets = [...balance.value, ...balance.bonusWallets].filter(wallet => wallet.currency === 'CNY');
    if (wallets.length === 0)
        return undefined;
    let total = 0;
    for (const wallet of wallets) {
        const value = amount(wallet.balance);
        if (value === undefined)
            return undefined;
        total += value;
    }
    return Math.round(total * 100) / 100;
}
/**
 * Read the official API's `/user/balance` answer.
 * @param body - the parsed JSON body.
 * @returns the CNY `total_balance`, or undefined.
 */
export function officialYuan(body) {
    if (body === null || typeof body !== 'object')
        return undefined;
    const infos = body.balance_infos;
    if (!Array.isArray(infos))
        return undefined;
    const cny = infos.find(info => info !== null && typeof info === 'object' && info.currency === 'CNY');
    return cny === undefined ? undefined : amount(cny.total_balance);
}
/** @returns what `read` found, or undefined when it failed. */
async function attempt(read) {
    try {
        return await read();
    }
    catch {
        return undefined;
    }
}
/**
 * Query the balance: the logged-in account first, else the official API key.
 * @param deps - the services to ask.
 * @returns the balance, "unknown" when neither answers.
 */
export async function queryBalance(deps) {
    const checkedAt = (deps.now ?? Date.now)();
    const yuan = await attempt(async () => (deps.account === undefined ? undefined : accountYuan(await deps.account.getBalance({
        version: '0', locale: 'zh-CN', timezoneOffsetSeconds: -new Date(checkedAt).getTimezoneOffset() * 60,
    })))) ?? await attempt(async () => {
        const key = (await deps.credentials?.resolve(API_KEY_REF))?.value;
        if (key === undefined || key === '')
            return undefined;
        const response = await (deps.fetch ?? globalThis.fetch)(OFFICIAL_BALANCE_URL, {
            headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
            signal: deps.signal ?? AbortSignal.timeout(15_000),
        });
        return response.ok ? officialYuan(await response.json()) : undefined;
    });
    return yuan === undefined ? { status: 'unknown', checkedAt } : { status: 'known', yuan, checkedAt };
}
/** @returns yuan with two decimals, as the reminder shows it. */
export function formatYuan(yuan) {
    return yuan.toFixed(2);
}
/**
 * The reminder the model appends, or undefined when none is due.
 * @param state - the latest balance.
 * @param threshold - remind below this many yuan.
 * @param template - the configured wording with `{balance}` and `{threshold}`.
 * @returns the filled-in wording.
 */
export function reminderFor(state, threshold, template) {
    if (state.status !== 'known' || state.yuan >= threshold)
        return undefined;
    return template
        .replaceAll('{balance}', formatYuan(state.yuan))
        .replaceAll('{threshold}', String(threshold));
}
