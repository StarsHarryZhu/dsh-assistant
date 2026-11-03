/**
 * The RMB balance of the DeepSeek account, and the reminder the model appends
 * when it runs low. Each conversation picks its own model, so the balance is
 * the household's, not one conversation's: the logged-in account, else the
 * official API key. A failed query is "unknown", and an unknown balance never
 * produces a reminder.
 * @module dsh-assisstant/host/balance
 */
import type { AccountBalanceLike, CredentialsLike, DeepseekAccountLike } from './types.ts';
/** What the plugin knows about the balance. */
export type BalanceState = {
    readonly status: 'known';
    readonly yuan: number;
    readonly checkedAt: number;
} | {
    readonly status: 'unknown';
    readonly checkedAt: number;
};
/** The official API's balance endpoint. */
export declare const OFFICIAL_BALANCE_URL = "https://api.deepseek.com/user/balance";
/**
 * Sum the CNY recharge and bonus wallets of a DeepSeek account.
 * @param balance - `deepseekAccount.getBalance()`'s answer.
 * @returns yuan, or undefined when the query failed or no CNY wallet exists.
 */
export declare function accountYuan(balance: AccountBalanceLike | null | undefined): number | undefined;
/**
 * Read the official API's `/user/balance` answer.
 * @param body - the parsed JSON body.
 * @returns the CNY `total_balance`, or undefined.
 */
export declare function officialYuan(body: unknown): number | undefined;
/** What a balance query needs. */
export interface BalanceDeps {
    readonly account?: DeepseekAccountLike | undefined;
    readonly credentials?: CredentialsLike | undefined;
    readonly fetch?: typeof globalThis.fetch;
    readonly now?: () => number;
    readonly signal?: AbortSignal;
}
/**
 * Query the balance: the logged-in account first, else the official API key.
 * @param deps - the services to ask.
 * @returns the balance, "unknown" when neither answers.
 */
export declare function queryBalance(deps: BalanceDeps): Promise<BalanceState>;
/** @returns yuan with two decimals, as the reminder shows it. */
export declare function formatYuan(yuan: number): string;
/**
 * The reminder the model appends, or undefined when none is due.
 * @param state - the latest balance.
 * @param threshold - remind below this many yuan.
 * @param template - the configured wording with `{balance}` and `{threshold}`.
 * @returns the filled-in wording.
 */
export declare function reminderFor(state: BalanceState, threshold: number, template: string): string | undefined;
