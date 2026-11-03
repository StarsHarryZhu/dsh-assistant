import { describe, expect, it } from 'vitest'
import { OFFICIAL_BALANCE_URL, accountYuan, officialYuan, queryBalance, reminderFor } from '../src/host/balance.ts'

describe('balance', () => {
  it('sums the CNY recharge and bonus wallets of an account', () => {
    expect(accountYuan({ status: 'ready', value: [{ currency: 'CNY', balance: '8.50' }, { currency: 'USD', balance: '3' }], bonusWallets: [{ currency: 'CNY', balance: '1.25' }] })).toBe(9.75)
    expect(accountYuan({ status: 'failed' })).toBeUndefined()
    expect(accountYuan(null)).toBeUndefined()
    expect(accountYuan({ status: 'ready', value: [{ currency: 'USD', balance: '3' }], bonusWallets: [] })).toBeUndefined()
  })

  it('reads the official API answer', () => {
    expect(officialYuan({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '1' }, { currency: 'CNY', total_balance: '110.00' }] })).toBe(110)
    expect(officialYuan({ balance_infos: [] })).toBeUndefined()
    expect(officialYuan('x')).toBeUndefined()
  })

  it('asks the logged-in account first, and the API only when the account has no answer', async () => {
    const calls: { url: string; auth: string }[] = []
    const fetch = (async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, auth: init.headers.authorization as string })
      return { ok: true, json: async () => ({ balance_infos: [{ currency: 'CNY', total_balance: '3.30' }] }) }
    }) as unknown as typeof globalThis.fetch
    const credentials = { resolve: async () => ({ value: 'sk-test' }) }

    const account = { getBalance: async () => ({ status: 'ready' as const, value: [{ currency: 'CNY', balance: '6' }], bonusWallets: [] }) }
    expect(await queryBalance({ account, credentials, fetch, now: () => 7 })).toEqual({ status: 'known', yuan: 6, checkedAt: 7 })
    expect(calls).toEqual([])

    const broken = { getBalance: async () => { throw new Error('logged out') } }
    expect(await queryBalance({ account: broken, credentials, fetch, now: () => 1 })).toEqual({ status: 'known', yuan: 3.3, checkedAt: 1 })
    expect(calls).toEqual([{ url: OFFICIAL_BALANCE_URL, auth: 'Bearer sk-test' }])
  })

  it('reads no answer from either as unknown', async () => {
    const broken = { getBalance: async () => { throw new Error('offline') } }
    expect((await queryBalance({ account: broken })).status).toBe('unknown')
    expect((await queryBalance({})).status).toBe('unknown')
    const noKey = { resolve: async () => undefined }
    expect((await queryBalance({ credentials: noKey })).status).toBe('unknown')
  })

  it('fills the reminder only below the threshold and only for a known balance', () => {
    const template = '余额 {balance} 元，低于 {threshold} 元'
    expect(reminderFor({ status: 'known', yuan: 9.5, checkedAt: 0 }, 10, template)).toBe('余额 9.50 元，低于 10 元')
    expect(reminderFor({ status: 'known', yuan: 10, checkedAt: 0 }, 10, template)).toBeUndefined()
    expect(reminderFor({ status: 'unknown', checkedAt: 0 }, 10, template)).toBeUndefined()
  })
})
