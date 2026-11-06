import { describe, expect, it } from 'vitest'
import { ASSISTANT_DEFAULTS, DEFAULTS, DEFAULT_WORKER_MODELS, assistantSettings, folderName, readAssistantSettings, readPeople, readWorkerModels, readWechatRequest, readWechatStates } from '../src/shared/settings.ts'
import { readSettings } from '../src/index.ts'
import { mergePeople, needingSessions, removedPeople } from '../src/host/people.ts'

const live = <T>(value: T) => ({ get: () => value })

describe('settings readers', () => {
  it('ships the defaults the user chose', () => {
    expect(DEFAULTS).toMatchObject({
      compactRatio: 0.5,
      balanceThreshold: 10,
      balanceCheckMinutes: 120,
      balanceReminder: '温馨提示：账户余额只剩 {balance} 元了（低于 {threshold} 元）。',
      personaSelfCorrect: true,
      personaCooldownHours: 24,
      personaMaxChars: 2000,
      profileMaxChars: 6000,
    })
    expect(DEFAULT_WORKER_MODELS).toEqual([{ provider: 'deepseek-account', model: 'deepseek-flash' }])
  })

  it('keeps a known permission on an assistant and drops anything else', () => {
    expect(readAssistantSettings({ sandboxMode: 'read-only' })).toEqual({ sandboxMode: 'read-only' })
    expect(readAssistantSettings({ sandboxMode: 'anything' })).toBeUndefined()
    expect(assistantSettings(undefined).sandboxMode).toBe('workspace-write')
  })

  it('fills every setting with its default and rejects out-of-range values', () => {
    expect(readSettings(undefined)).toEqual({ ...DEFAULTS, workerModels: DEFAULT_WORKER_MODELS })
    const read = readSettings({ compactRatio: live(0.95), balanceReminder: live(''), balanceThreshold: live(5), balanceCheckMinutes: live(99_999_999) } as never)
    expect(read.compactRatio).toBe(DEFAULTS.compactRatio)
    expect(read.balanceReminder).toBe(DEFAULTS.balanceReminder)
    expect(read.balanceCheckMinutes).toBe(DEFAULTS.balanceCheckMinutes)
    expect(read.balanceThreshold).toBe(5)
  })

  it('reads the worker models, and never leaves workers without one', () => {
    expect(readWorkerModels(undefined)).toEqual(DEFAULT_WORKER_MODELS)
    expect(readWorkerModels([])).toEqual(DEFAULT_WORKER_MODELS)
    expect(readWorkerModels([{ provider: 'p', model: 'a' }, { provider: 'p', model: 'a' }, { provider: 'p' }, 3, { provider: 'q', model: 'b' }]))
      .toEqual([{ provider: 'p', model: 'a' }, { provider: 'q', model: 'b' }])
  })

  it('reads an assistant\'s own settings, keeping only what is well formed', () => {
    expect(readAssistantSettings(undefined)).toBeUndefined()
    expect(readAssistantSettings({ watchdogStallMinutes: 1, wechatReplyMaxChars: 5, reminderLeadMinutes: -1 })).toBeUndefined()
    expect(readAssistantSettings({ dailyBriefTime: ' 07:30 ', watchdogStallMinutes: 120, wechatEnabled: false, reminderLeadMinutes: 0 }))
      .toEqual({ dailyBriefTime: '07:30', watchdogStallMinutes: 120, wechatEnabled: false, reminderLeadMinutes: 0 })
    expect(readAssistantSettings({ dailyBriefTime: '' })).toEqual({ dailyBriefTime: '' })
    expect(assistantSettings(undefined)).toEqual(ASSISTANT_DEFAULTS)
    expect(assistantSettings({ settings: { wechatEnabled: false } })).toEqual({ ...ASSISTANT_DEFAULTS, wechatEnabled: false })
    expect(readPeople([{ id: 'a', name: '阿福', settings: { watchdogStallMinutes: 120 } }])).toEqual([{ id: 'a', name: '阿福', settings: { watchdogStallMinutes: 120 } }])
  })

  it('reads the heartbeat and quiet hours, refusing an interval out of bounds', () => {
    expect(readAssistantSettings({ heartbeatMinutes: 3 })).toBeUndefined()
    expect(readAssistantSettings({ heartbeatMinutes: 2000 })).toBeUndefined()
    expect(readAssistantSettings({ heartbeatMinutes: 0, heartbeatIdleWake: false })).toEqual({ heartbeatMinutes: 0, heartbeatIdleWake: false })
    expect(readAssistantSettings({ quietStart: ' 23:00 ', quietEnd: '', tempQuietUntil: 9, tempQuietFrom: 'x' })).toEqual({ quietStart: '23:00', quietEnd: '', tempQuietUntil: 9 })
    expect(ASSISTANT_DEFAULTS).toMatchObject({ heartbeatMinutes: 60, heartbeatIdleWake: true, quietStart: '22:00', quietEnd: '08:00', dailyBriefTime: '08:00' })
  })

  it('keeps where the user said they are', () => {
    expect(readPeople([{ id: 'a', name: '阿福', zoneHint: ' 上海 ' }])).toEqual([{ id: 'a', name: '阿福', zoneHint: '上海' }])
    expect(readPeople([{ id: 'a', name: '阿福', zoneHint: ' ' }])).toEqual([{ id: 'a', name: '阿福' }])
  })

  it('keeps only well-formed assistants, first id winning, with an optional form of address', () => {
    expect(readPeople([
      { id: 'a', name: '阿福', address: '妈妈', cwd: '/f/mom', sessionId: 's1' },
      { id: 'a', name: 'dup' },
      { id: 'b', name: '  ' },
      'junk',
      { id: 'c', name: '小管家', address: ' ' },
    ])).toEqual([{ id: 'a', name: '阿福', address: '妈妈', cwd: '/f/mom', sessionId: 's1' }, { id: 'c', name: '小管家' }])
    expect(readPeople(undefined)).toEqual([])
  })

  it('reads WeChat requests and states defensively', () => {
    expect(readWechatRequest({ personId: 'a', action: 'bind', nonce: 'n1' })).toEqual({ personId: 'a', action: 'bind', nonce: 'n1' })
    expect(readWechatRequest({ personId: 'a', action: 'options', nonce: 'n', options: { sendMode: 'steer', commands: 'yes' } }))
      .toEqual({ personId: 'a', action: 'options', nonce: 'n', options: { sendMode: 'steer' } })
    expect(readWechatStates({ a: { status: 'bound', updatedAt: 1, connected: false, lastError: ' 断开 ', sendMode: 'x', commands: false,
      diagnosis: { ok: true, at: 3, checks: [{ label: '服务可达', ok: true }, { ok: true }] } } }).a)
      .toEqual({ status: 'bound', updatedAt: 1, connected: false, lastError: '断开', commands: false, diagnosis: { ok: true, at: 3, checks: [{ label: '服务可达', ok: true }] } })
    expect(readWechatRequest({ personId: 'a', action: 'steal', nonce: 'n1' })).toBeUndefined()
    expect(readWechatRequest(null)).toBeUndefined()
    expect(readWechatStates({ a: { status: 'qr', qr: 'https://x', expiresAt: 5, updatedAt: 1 }, b: { status: 'weird' }, c: null }))
      .toEqual({ a: { status: 'qr', qr: 'https://x', expiresAt: 5, updatedAt: 1 } })
  })

  it('makes a safe folder name', () => {
    expect(folderName('妈妈')).toBe('妈妈')
    expect(folderName('a/b:c')).toBe('a-b-c')
    expect(folderName('..')).toBe('untitled')
  })
})

describe('assistant list planning', () => {
  it('merges the host findings into the latest list only', () => {
    const latest = [{ id: 'a', name: '妈妈', cwd: '/c' }, { id: 'b', name: '爷爷', cwd: '/d', sessionId: 's2' }, { id: 'c', name: '没选文件夹' }]
    expect(mergePeople(latest, new Map([['a', { sessionId: 's1' }]]))).toEqual([
      { id: 'a', name: '妈妈', cwd: '/c', sessionId: 's1' }, { id: 'b', name: '爷爷', cwd: '/d', sessionId: 's2' }, { id: 'c', name: '没选文件夹' },
    ])
    expect(mergePeople(latest, new Map([['gone', { sessionId: 's9' }]]))).toBeUndefined()
    expect(needingSessions(latest).map(person => person.id)).toEqual(['a'])
    expect(removedPeople(latest, [latest[1] as never]).map(person => person.id)).toEqual(['a', 'c'])
  })
})
