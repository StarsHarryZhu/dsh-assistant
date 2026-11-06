/**
 * The record tools end to end over real files: what each writes, how it reports,
 * and what it refuses.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordStore } from '../src/host/records/store.ts'
import { ROUTER_ONLY_TOOLS, recordTools } from '../src/host/records/tools.ts'
import { DEFAULTS } from '../src/shared/settings.ts'
import type { SharedSettings } from '../src/host/service.ts'

const NOW = Date.parse('2026-11-02T12:00:00Z')
const ZONE = 'America/New_York'

type Tool = { name: string; execute(args: unknown, exec: unknown): Promise<{ ok: boolean; message: string }>; presentCall?(args: unknown): { title: string } | undefined }

function setup(options: { role?: 'router' | 'worker'; settings?: Partial<SharedSettings>; quiet?: { quietStart: string; quietEnd: string } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsa-records-'))
  const tools = recordTools(options.role ?? 'router', {
    target: () => ({ store: new RecordStore(root), zone: ZONE, assistant: { reminderLeadMinutes: 30, quietStart: '', quietEnd: '', ...options.quiet } }),
    settings: () => ({ ...DEFAULTS, ...options.settings }) as SharedSettings,
  }) as Tool[]
  const call = (name: string, args: Record<string, unknown>) => (tools.find(tool => tool.name === name) as Tool).execute(args, {})
  const file = (path: string) => readFileSync(join(root, path), 'utf8')
  return { root, tools, call, file }
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: NOW }) })
afterEach(() => { vi.useRealTimers() })

describe('calendar_add', () => {
  it('stores a local time as UTC and says when the reminder will come', async () => {
    const { call, file } = setup()
    const result = await call('calendar_add', { title: '看牙医', kind: '日程', date: '2026-11-05', time: '14:30' })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('11/05 周四 14:30 · 日程 · 看牙医')
    expect(result.message).toContain('A reminder will come 30 minutes before, at 14:00.')
    expect(file('ddl.md')).toContain('- [ ] 2026-11-05T19:30Z · 日程 · 看牙医')
  })

  it('applies the default times and promises no reminder without a clock time', async () => {
    const { call, file } = setup()
    await call('calendar_add', { title: '交水电费', kind: 'DDL', date: '2026-11-06' })
    await call('calendar_add', { title: '回老家', kind: '日程', date: '2026-11-07' })
    await call('calendar_add', { title: '买新眼镜', kind: 'DDL' })
    const text = file('ddl.md')
    expect(text).toContain('- [ ] 2026-11-07T04:59Z · DDL · 交水电费')
    expect(text).toContain('- [ ] 2026-11-07T05:00Z – 2026-11-08T04:59Z · 日程 · 回老家')
    expect(text).toContain('- [ ] 无日期 · DDL · 买新眼镜')
    expect(text.indexOf('交水电费')).toBeLessThan(text.indexOf('回老家'))
    expect(text.indexOf('回老家')).toBeLessThan(text.indexOf('买新眼镜'))
  })

  it('refuses a past time and malformed input without writing', async () => {
    const { call, root } = setup()
    expect((await call('calendar_add', { title: 'x', kind: 'DDL', date: '2020-01-01' })).ok).toBe(false)
    expect((await call('calendar_add', { title: 'x', kind: 'DDL', date: '2026-13-40' })).ok).toBe(false)
    expect((await call('calendar_add', { title: 'x', kind: 'DDL', date: '2026-11-05', time: '25:00' })).ok).toBe(false)
    expect((await call('calendar_add', { title: 'x', kind: 'DDL', time: '10:00' })).ok).toBe(false)
    expect(readdirSync(root)).toEqual([])
  })

  it('says so when it is too late for the lead time', async () => {
    const soon = setup()
    const result = await soon.call('calendar_add', { title: '开会', kind: '日程', date: '2026-11-02', time: '07:10' })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('no reminder will come')
  })

  it('leaves out the reminder when asked, and marks that in the file', async () => {
    const { call, file } = setup()
    const result = await call('calendar_add', { title: '开会', kind: '日程', date: '2026-11-05', time: '10:00', remind: false })
    expect(result.message).not.toContain('reminder')
    expect(file('ddl.md')).toContain('· 日程 · 开会（不提醒）')
    await call('calendar_update', { match: '开会', action: 'change', time: '11:00' })
    expect(file('ddl.md')).toContain('· 日程 · 开会（不提醒）')
    const again = await call('calendar_update', { match: '开会', action: 'change', remind: true })
    expect(again.message).toContain('A reminder will come')
    expect(file('ddl.md')).not.toContain('不提醒')
  })

  it('says where quiet hours move a reminder', async () => {
    const { call } = setup({ quiet: { quietStart: '22:00', quietEnd: '08:00' } })
    const morning = await call('calendar_add', { title: '早会', kind: '日程', date: '2026-11-05', time: '08:15' })
    expect(morning.message).toContain('it will come at 11/05 08:00 instead')
    const night = await call('calendar_add', { title: '夜班', kind: '日程', date: '2026-11-05', time: '23:30' })
    expect(night.message).toContain('it will come at 11/05 21:59 instead')
  })

  it('reads a time in another zone when told, showing it in theirs', async () => {
    const { call, file } = setup()
    const result = await call('calendar_add', { title: '东京开会', kind: '日程', date: '2026-11-05', time: '15:00', time_zone: 'Asia/Tokyo' })
    expect(result.ok).toBe(true)
    expect(file('ddl.md')).toContain('2026-11-05T06:00Z · 日程 · 东京开会')
    expect(result.message).toContain('11/05 周四 01:00')
    expect((await call('calendar_add', { title: 'x', kind: '日程', date: '2026-11-05', time: '15:00', time_zone: '东京' })).ok).toBe(false)
  })

  it('records each kind of repeat in local time', async () => {
    const { call, file } = setup()
    const first = await call('calendar_add', { title: '吃药', kind: '日程', repeat: 'daily', time: '08:00' })
    expect(first.message).toContain('A reminder will come 30 minutes before each time')
    await call('calendar_add', { title: '钢琴课', kind: '日程', repeat: 'weekly', date: '2026-11-04', time: '19:00' })
    await call('calendar_add', { title: '健身', kind: '日程', repeat: 'weekly', weekdays: [5, 1, 3], time: '00:10' })
    await call('calendar_add', { title: '交房租', kind: 'DDL', repeat: 'monthly', date: '2026-12-05', time: '09:00' })
    await call('calendar_add', { title: '妈妈生日', kind: '日程', repeat: 'yearly', date: '2027-03-05' })
    const text = file('ddl.md')
    expect(text).toContain('- 每天 08:00 · 日程 · 吃药')
    expect(text).toContain('- 每周三 19:00 · 日程 · 钢琴课')
    expect(text).toContain('- 每周一三五 00:10 · 日程 · 健身')
    expect(text).toContain('- 每月5日 09:00 · DDL · 交房租')
    expect(text).toContain('- 每年3月5日 · 日程 · 妈妈生日')
    expect(text.indexOf('## 重复')).toBeLessThan(text.indexOf('## 待完成'))
  })

  it('needs a date for a repeat that has no other anchor', async () => {
    const { call } = setup()
    expect((await call('calendar_add', { title: '交房租', kind: 'DDL', repeat: 'monthly' })).ok).toBe(false)
  })

  it('keeps hand-written lines and adds the section an older file lacks', async () => {
    const { call, root, file } = setup()
    writeFileSync(join(root, 'ddl.md'), '# DDL 与行程\n\n我自己写的一句话\n\n## 待完成\n\n- [ ] 2026-11-05T19:30Z · 日程 · 看牙医\n- [ ] 2026-01-01T00:00Z · DDL · 早过去了\n\n## 已完成\n')
    await call('calendar_add', { title: '吃药', kind: '日程', repeat: 'daily', time: '08:00' })
    await call('calendar_add', { title: '开会', kind: '日程', date: '2026-11-04', time: '10:00' })
    const text = file('ddl.md')
    expect(text).toContain('我自己写的一句话')
    expect(text).not.toContain('早过去了')
    expect(text.indexOf('## 重复')).toBeLessThan(text.indexOf('## 待完成'))
    expect(text.indexOf('开会')).toBeLessThan(text.indexOf('看牙医'))
  })
})

describe('calendar_update', () => {
  it('moves an item, keeping what was not changed', async () => {
    const { call, file } = setup()
    await call('calendar_add', { title: '看牙医', kind: '日程', date: '2026-11-05', time: '14:30' })
    const byDate = await call('calendar_update', { match: '牙医', action: 'change', date: '2026-11-06' })
    expect(byDate.message).toContain('11/06 周五 14:30')
    expect(file('ddl.md')).toContain('2026-11-06T19:30Z · 日程 · 看牙医')
    const byTime = await call('calendar_update', { match: '看牙医', action: 'change', time: '16:00' })
    expect(byTime.ok).toBe(true)
    expect(file('ddl.md')).toContain('2026-11-06T21:00Z · 日程 · 看牙医')
    expect(byTime.message).toContain('A reminder will come 30 minutes before, at 15:30.')
  })

  it('keeps a span\'s length when it moves', async () => {
    const { call, file } = setup()
    await call('calendar_add', { title: '开会', kind: '日程', date: '2026-11-05', time: '10:00', end_time: '11:30' })
    await call('calendar_add', { title: '回老家', kind: '日程', date: '2026-11-07', end_date: '2026-11-09' })
    await call('calendar_update', { match: '开会', action: 'change', date: '2026-11-06' })
    await call('calendar_update', { match: '回老家', action: 'change', date: '2026-11-14' })
    const text = file('ddl.md')
    expect(text).toContain('2026-11-06T15:00Z – 2026-11-06T16:30Z · 日程 · 开会')
    expect(text).toContain('2026-11-14T05:00Z – 2026-11-17T04:59Z · 日程 · 回老家')
  })

  it('finishes, reopens, and removes', async () => {
    const { call, file } = setup()
    await call('calendar_add', { title: '看牙医', kind: '日程', date: '2026-11-05', time: '14:30' })
    await call('calendar_update', { match: '看牙医', action: 'done' })
    let text = file('ddl.md')
    expect(text.indexOf('- [x] 2026-11-05T19:30Z · 日程 · 看牙医（完成 2026-11-02T12:00Z）')).toBeGreaterThan(text.indexOf('## 已完成'))
    await call('calendar_update', { match: '看牙医', action: 'reopen' })
    text = file('ddl.md')
    expect(text).toContain('- [ ] 2026-11-05T19:30Z · 日程 · 看牙医\n')
    await call('calendar_update', { match: '看牙医', action: 'remove' })
    expect(file('ddl.md')).not.toContain('看牙医')
  })

  it('tells same-named items apart by date', async () => {
    const { call, file } = setup()
    await call('calendar_add', { title: '看牙医', kind: '日程', date: '2026-11-05', time: '14:30' })
    await call('calendar_add', { title: '看牙医', kind: '日程', date: '2026-11-12', time: '14:30' })
    const ambiguous = await call('calendar_update', { match: '看牙医', action: 'remove' })
    expect(ambiguous.ok).toBe(false)
    expect(ambiguous.message).toContain('11/05 周四')
    expect(ambiguous.message).toContain('11/12 周四')
    const result = await call('calendar_update', { match: '看牙医', on: '2026-11-12', action: 'remove' })
    expect(result.ok).toBe(true)
    expect(file('ddl.md')).toContain('2026-11-05T19:30Z')
    expect(file('ddl.md')).not.toContain('2026-11-12')
  })

  it('lists what exists when nothing matches', async () => {
    const { call } = setup()
    await call('calendar_add', { title: '看牙医', kind: '日程', date: '2026-11-05', time: '14:30' })
    const result = await call('calendar_update', { match: '理发', action: 'remove' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('看牙医')
  })

  it('changes a repeating item, and does not tick it', async () => {
    const { call, file } = setup()
    await call('calendar_add', { title: '吃药', kind: '日程', repeat: 'daily', time: '08:00' })
    await call('calendar_update', { match: '吃药', action: 'change', time: '09:00' })
    expect(file('ddl.md')).toContain('- 每天 09:00 · 日程 · 吃药')
    await call('calendar_update', { match: '吃药', action: 'change', repeat: 'weekly', weekdays: [1, 2] })
    expect(file('ddl.md')).toContain('- 每周一二 09:00 · 日程 · 吃药')
    expect((await call('calendar_update', { match: '吃药', action: 'done' })).ok).toBe(false)
    expect((await call('calendar_update', { match: '吃药', action: 'remove' })).ok).toBe(true)
  })

  it('keeps a note when the title changes, and can change the note', async () => {
    const { call, file } = setup()
    await call('calendar_add', { title: '看牙医', kind: '日程', date: '2026-11-05', note: '带病历' })
    await call('calendar_update', { match: '看牙医', action: 'change', title: '洗牙' })
    expect(file('ddl.md')).toContain('洗牙（带病历）')
    await call('calendar_update', { match: '洗牙', action: 'change', note: '带医保卡' })
    expect(file('ddl.md')).toContain('洗牙（带医保卡）')
  })
})

describe('list_update', () => {
  it('creates, adds, ticks, unticks, and removes, and reports the open items', async () => {
    const { call, file } = setup()
    const added = await call('list_update', { list: '买菜', add: ['牛奶', '鸡蛋', '青菜'] })
    expect(added.message).toContain('has 3 open')
    expect(file('lists/买菜.md')).toContain('# 买菜')
    await call('list_update', { list: '买菜', check: ['牛奶'], remove: ['青菜'] })
    let text = file('lists/买菜.md')
    expect(text).toContain('- [x] 牛奶（完成 2026-11-02）')
    expect(text).not.toContain('青菜')
    await call('list_update', { list: '买菜', uncheck: ['牛奶'] })
    text = file('lists/买菜.md')
    expect(text).toContain('- [ ] 牛奶\n')
  })

  it('opens a ticked item again instead of adding it twice, and reports what it could not find', async () => {
    const { call, file } = setup()
    await call('list_update', { list: '买菜', add: ['牛奶'] })
    await call('list_update', { list: '买菜', check: ['牛奶'] })
    const result = await call('list_update', { list: '买菜', add: ['牛奶'], check: ['西瓜'] })
    expect(file('lists/买菜.md').match(/牛奶/gu)).toHaveLength(1)
    expect(file('lists/买菜.md')).toContain('- [ ] 牛奶')
    expect(result.message).toContain('Not found: 西瓜')
  })

  it('drops items ticked over a week ago', async () => {
    const { call, root, file } = setup()
    const path = join(root, 'lists')
    await call('list_update', { list: '买菜', add: ['牛奶'] })
    writeFileSync(join(path, '买菜.md'), '# 买菜\n\n- [x] 旧东西（完成 2026-10-01）\n- [x] 新东西（完成 2026-10-30）\n')
    await call('list_update', { list: '买菜', add: ['鸡蛋'] })
    expect(file('lists/买菜.md')).not.toContain('旧东西')
    expect(file('lists/买菜.md')).toContain('新东西')
  })

  it('deletes a whole list', async () => {
    const { call, root } = setup()
    await call('list_update', { list: '买菜', add: ['牛奶'] })
    await call('list_update', { list: '买菜', delete_list: true })
    expect(existsSync(join(root, 'lists', '买菜.md'))).toBe(false)
  })

  it('stays inside the workspace whatever the name says', async () => {
    const { call, root } = setup()
    await call('list_update', { list: '../../evil', add: ['x'] })
    await call('log_add', { log: '../evil', text: 'x' })
    await call('project_update', { project: '..', status: 'x' })
    expect(readdirSync(root).sort()).toEqual(['lists', 'logs', 'projects'])
    expect(readdirSync(join(root, 'lists'))).toEqual(['..-..-evil.md'])
    expect(readdirSync(join(root, 'logs'))).toEqual(['..-evil.md'])
    expect(readdirSync(join(root, 'projects'))).toEqual(['untitled.md'])
  })
})

describe('memo_set', () => {
  it('adds, replaces, and deletes by name', async () => {
    const { call, file } = setup()
    await call('memo_set', { key: '备用钥匙', value: '鞋柜第二层' })
    await call('memo_set', { key: '王阿姨电话', value: '138' })
    expect(file('memo.md')).toContain('- 备用钥匙：鞋柜第二层（2026-11-02）')
    expect((await call('memo_set', { key: '备用钥匙', value: '抽屉里' })).message).toContain('Updated')
    expect(file('memo.md').match(/备用钥匙/gu)).toHaveLength(1)
    expect(file('memo.md')).toContain('抽屉里')
    expect((await call('memo_set', { key: '备用钥匙', value: '' })).message).toContain('Deleted')
    expect(file('memo.md')).not.toContain('备用钥匙')
    expect(file('memo.md')).toContain('王阿姨电话')
    expect((await call('memo_set', { key: '没有的', value: '' })).ok).toBe(false)
  })

  it('refuses an overlong value', async () => {
    const { call } = setup()
    expect((await call('memo_set', { key: 'a', value: 'x'.repeat(1001) })).ok).toBe(false)
  })
})

describe('log_add', () => {
  it('stamps the current local time, keeps time order, and replaces the latest', async () => {
    const { call, file } = setup()
    await call('log_add', { log: '血压', text: '135/85' })
    expect(file('logs/血压.md')).toContain('- 2026-11-02 07:00 · 135/85')
    await call('log_add', { log: '血压', text: '130/80', date: '2026-11-01', time: '20:00' })
    const text = file('logs/血压.md')
    expect(text.indexOf('130/80')).toBeLessThan(text.indexOf('135/85'))
    await call('log_add', { log: '血压', text: '125/80', replace_last: true })
    expect(file('logs/血压.md')).not.toContain('135/85')
    expect(file('logs/血压.md')).toContain('125/80')
    expect(file('logs/血压.md')).toContain('130/80')
  })
})

describe('project_update', () => {
  it('creates the file and edits its fields, to-dos, and notes', async () => {
    const { call, file } = setup()
    await call('project_update', { project: '装修', goal: 'move in by year end', status: 'choosing materials', add_todo: ['measure', 'order tiles'], note: 'the builder is Mr. Li' })
    let text = file('projects/装修.md')
    expect(text).toContain('- Goal: move in by year end')
    expect(text).toContain('- Status: choosing materials')
    expect(text).toContain('- [ ] measure')
    expect(text).toContain('- 2026-11-02: the builder is Mr. Li')
    const result = await call('project_update', { project: '装修', status: 'started', check_todo: ['measure', '没有这项'] })
    text = file('projects/装修.md')
    expect(text).toContain('- Status: started')
    expect(text).toContain('- [x] measure')
    expect(text).not.toContain('choosing materials')
    expect(result.message).toContain('To-dos not found: 没有这项')
  })
})

describe('profile_set', () => {
  it('adds to a field, replaces it, and holds to the length limit', async () => {
    const { call, file } = setup({ settings: { profileMaxChars: 200 } })
    await call('profile_set', { field: 'Likes', value: 'tea' })
    await call('profile_set', { field: 'Likes', value: 'walks' })
    await call('profile_set', { field: 'Likes', value: 'tea' })
    expect(file('profile.md')).toContain('# Profile')
    expect(file('profile.md')).toContain('- Likes: tea; walks')
    await call('profile_set', { field: 'Likes', value: 'opera', mode: 'replace' })
    expect(file('profile.md')).toContain('- Likes: opera\n')
    const before = file('profile.md')
    expect((await call('profile_set', { field: 'Other', value: 'x'.repeat(200) })).ok).toBe(false)
    expect(file('profile.md')).toBe(before)
  })

  it('rejects a field outside the list', async () => {
    const { call, file } = setup()
    await expect(call('profile_set', { field: 'Bank card', value: 'x' })).rejects.toThrow()
    await expect(call('profile_set', { field: 'Passport', value: 'x' })).rejects.toThrow()
    await call('profile_set', { field: 'Likes', value: 'tea' })
    expect(file('profile.md')).not.toMatch(/passport/iu)
    expect(file('profile.md')).toContain('- Form of address:')
    expect(file('profile.md')).not.toMatch(/[\u4e00-\u9fff]/u)
  })
})

describe('persona_set', () => {
  const change = { field: 'Tone', value: 'more relaxed', evidence: 'she said not so formal' }

  it('changes an adjustable line, logs it, and leaves the core alone', async () => {
    const { call, file } = setup()
    expect((await call('persona_set', change)).ok).toBe(true)
    const text = file('persona.md')
    expect(text).toContain('- Tone: more relaxed')
    expect(text).toContain('- 2026-11-02: Tone changed to "more relaxed" (evidence: she said not so formal)')
    expect(text).toContain('## Core (fixed)')
    expect(text).not.toMatch(/[\u4e00-\u9fff]/u)
    await expect(call('persona_set', { ...change, field: 'Core' })).rejects.toThrow()
  })

  it('holds back its own changes during the cooldown, but not what they asked for', async () => {
    const { call, file, root } = setup({ settings: { personaCooldownHours: 24 } })
    await call('persona_set', change)
    const path = join(root, 'persona.md')
    utimesSync(path, new Date(NOW - 3_600_000), new Date(NOW - 3_600_000))
    const held = await call('persona_set', { ...change, value: 'even more relaxed' })
    expect(held.ok).toBe(false)
    expect(file('persona.md')).not.toContain('even more relaxed')
    expect((await call('persona_set', { ...change, value: 'even more relaxed', requested: true })).ok).toBe(true)
    utimesSync(path, new Date(NOW - 25 * 3_600_000), new Date(NOW - 25 * 3_600_000))
    expect((await call('persona_set', { ...change, value: 'a bit formal' })).ok).toBe(true)
  })

  it('changes nothing when self-correction is off', async () => {
    const { call, root } = setup({ settings: { personaSelfCorrect: false } })
    expect((await call('persona_set', { ...change, requested: true })).ok).toBe(false)
    expect(existsSync(join(root, 'persona.md'))).toBe(false)
  })

  it('forgets the oldest log lines to stay under the limit', async () => {
    const { call, file } = setup({ settings: { personaMaxChars: 520 } })
    for (let round = 0; round < 12; round += 1) expect((await call('persona_set', { ...change, value: `round ${round}`, requested: true })).ok).toBe(true)
    const text = file('persona.md')
    expect(text.length).toBeLessThanOrEqual(520)
    expect(text).toContain('round 11')
    expect(text).not.toContain('changed to "round 0"')
  })
})

describe('recall', () => {
  it('searches every kind by keywords, with schedule times in local time', async () => {
    const { call } = setup()
    await call('calendar_add', { title: '和王阿姨吃饭', kind: '日程', date: '2026-11-05', time: '18:00' })
    await call('memo_set', { key: '王阿姨电话', value: '138' })
    await call('list_update', { list: '要带的', add: ['给王阿姨的礼物'] })
    await call('log_add', { log: '记账', text: '王阿姨的礼物 200' })
    await call('project_update', { project: '聚会', note: '王阿姨也来' })
    await call('memo_set', { key: '备用钥匙', value: '鞋柜' })
    const { message } = await call('recall', { query: '王阿姨' })
    expect(message).toContain('11/05 周四 18:00 · 日程 · 和王阿姨吃饭')
    expect(message).toContain('王阿姨电话: 138')
    expect(message).toContain('要带的: 给王阿姨的礼物')
    expect(message).toContain('记账: 2026-11-02 07:00 王阿姨的礼物 200')
    expect(message).toContain('王阿姨也来')
    expect(message).not.toContain('备用钥匙')
    expect((await call('recall', { query: '不存在的' })).message).toContain('Nothing in the records matches')
  })

  it('narrows by kind, name, and dates', async () => {
    const { call } = setup()
    await call('calendar_add', { title: '近的', kind: '日程', date: '2026-11-05', time: '18:00' })
    await call('calendar_add', { title: '远的', kind: '日程', date: '2026-12-25', time: '18:00' })
    await call('calendar_add', { title: '每周的', kind: '日程', repeat: 'weekly', date: '2026-11-04' })
    await call('calendar_add', { title: '每年的', kind: '日程', repeat: 'yearly', date: '2027-03-05' })
    const december = (await call('recall', { kind: 'calendar', from: '2026-12-01', to: '2026-12-31' })).message
    expect(december).toContain('远的')
    expect(december).toContain('每周的')
    expect(december).not.toContain('近的')
    expect(december).not.toContain('每年的')
    await call('list_update', { list: '买菜', add: ['牛奶'] })
    await call('list_update', { list: '要带的', add: ['雨伞'] })
    const one = (await call('recall', { kind: 'list', name: '买菜' })).message
    expect(one).toContain('牛奶')
    expect(one).not.toContain('雨伞')
    expect((await call('recall', { from: 'soon' })).ok).toBe(false)
  })

  it('shows a long log\'s latest entries and cuts an overlong result', async () => {
    const { call } = setup()
    for (let round = 0; round < 35; round += 1) await call('log_add', { log: '血压', text: `第${round}次`, date: '2026-11-01', time: `${String(round % 24).padStart(2, '0')}:${String(round).padStart(2, '0')}` })
    expect((await call('recall', { kind: 'log', name: '血压' })).message).toContain('5 earlier entries not shown')
    for (let round = 0; round < 30; round += 1) await call('memo_set', { key: `k${round}`, value: 'x'.repeat(400) })
    expect((await call('recall', { kind: 'memo' })).message).toContain('the result is too long')
  })
})

describe('the two roles', () => {
  it('gives workers everything but the profile and persona', () => {
    const router = setup().tools.map(tool => tool.name)
    const worker = setup({ role: 'worker' }).tools.map(tool => tool.name)
    expect(router).toHaveLength(9)
    expect(router.filter(name => !worker.includes(name))).toEqual([...ROUTER_ONLY_TOOLS])
  })

  it('shows a plain title on every call card', () => {
    const { tools } = setup()
    const args: Record<string, Record<string, unknown>> = {
      calendar_add: { title: '看牙医', kind: '日程' },
      calendar_update: { match: '看牙医', action: 'done' },
      list_update: { list: '买菜' },
      memo_set: { key: '钥匙', value: '鞋柜' },
      log_add: { log: '血压', text: '135/85' },
      project_update: { project: '装修' },
      recall: {},
      profile_set: { field: 'Likes', value: 'tea' },
      persona_set: { field: 'Tone', value: 'relaxed', evidence: 'she said so' },
    }
    for (const tool of tools) expect(tool.presentCall?.(args[tool.name])?.title, tool.name).toMatch(/\p{Script=Han}/u)
    expect(tools[0]?.presentCall?.(args.calendar_add)?.title).toBe('记日程：看牙医')
  })
})
