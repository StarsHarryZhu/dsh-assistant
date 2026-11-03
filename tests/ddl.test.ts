import { describe, expect, it } from 'vitest'
import { describeEntry, parseDdl, repeatsOn, todayItems, weekView, zonedToUtc } from '../src/host/ddl.ts'

const FILE = `# DDL 与行程

> 助理维护。

## 待完成

- [ ] 2026-10-28T18:00Z · 日程 · 看牙医
- [ ] 2026-10-29T04:00Z – 2026-10-30T03:59Z · 日程 · 回老家
- [ ] 2026-10-31T03:59Z · DDL · 交水电费
- [ ] 2026-10-26T22:00Z – 2026-10-29T22:00Z · 日程 · 出差
- [ ] 2026-12-01T04:59Z · DDL · 年检
- [ ] 无日期 · DDL · 买新眼镜
- [ ] not a line
- [ ] 2026-13-40T99:99Z · DDL · bad time

## 已完成

- [x] 2026-10-28T03:59Z · DDL · 体检报告（完成 2026-10-26T14:30Z）
- [x] 无日期 · DDL · 还书（完成 2026-10-25T20:10Z）
`

describe('ddl.md fast path', () => {
  it('parses dated, spanning, undated, and done lines and skips the rest', () => {
    const entries = parseDdl(FILE)
    expect(entries.map(entry => entry.title)).toEqual(['看牙医', '回老家', '交水电费', '出差', '年检', '买新眼镜', '体检报告', '还书'])
    expect(entries[1]?.end).toBe(Date.UTC(2026, 9, 30, 3, 59))
    expect(entries[5]?.start).toBeUndefined()
    expect(entries[6]?.done).toBe(true)
  })

  it('renders the week in the user\'s zone', () => {
    const view = weekView(parseDdl(FILE), new Date('2026-10-27T14:00:00Z'), 'America/New_York')
    expect(view).toContain('**未来一周 · 10/27 周二 – 11/02 周一**')
    expect(view).toContain('- 10/27 周二（今天）\n  - 📅 全天 出差（至 10/29）')
    expect(view).toContain('- 10/28 周三\n  - 📅 14:00 看牙医')
    expect(view).toContain('  - 📅 全天 回老家')
    expect(view).toContain('- 10/30 周五\n  - 📝 23:59 交水电费')
    expect(view).toContain('**未定日期**\n- 📝 买新眼镜')
    expect(view).toContain('- 10/27 周二 📝 23:59 体检报告')
    expect(view).toContain('- 未定日期 · 📝 还书')
    expect(view).toContain('一周之后还有 1 项待完成。')
  })

  it('lists today\'s items for the brief, and nothing on a free day', () => {
    const entries = parseDdl(FILE)
    expect(todayItems(entries, new Date('2026-10-28T12:00:00Z'), 'America/New_York')).toEqual(['📅 全天 出差（至 10/29）', '📅 14:00 看牙医'])
    expect(todayItems(entries, new Date('2026-11-05T12:00:00Z'), 'America/New_York')).toEqual([])
  })

  it('shows an empty week for an empty file', () => {
    expect(weekView([], new Date('2026-10-27T14:00:00Z'), 'Asia/Shanghai')).toContain('- 10/27 周二（今天） · 无')
  })
})

describe('local time to UTC', () => {
  const NY = 'America/New_York'

  it('follows the zone on each side of a clock change', () => {
    expect(new Date(zonedToUtc('2026-11-05', '14:30', NY)).toISOString()).toBe('2026-11-05T19:30:00.000Z')
    expect(new Date(zonedToUtc('2026-07-05', '14:30', NY)).toISOString()).toBe('2026-07-05T18:30:00.000Z')
    expect(new Date(zonedToUtc('2026-11-05', '14:30', 'Asia/Shanghai')).toISOString()).toBe('2026-11-05T06:30:00.000Z')
  })

  it('reads a repeated time as the earlier one and moves a skipped time forward', () => {
    expect(new Date(zonedToUtc('2026-11-01', '01:30', NY)).toISOString()).toBe('2026-11-01T05:30:00.000Z')
    expect(new Date(zonedToUtc('2026-03-08', '02:30', NY)).toISOString()).toBe('2026-03-08T07:30:00.000Z')
  })
})

describe('repeating items', () => {
  const REPEATS = `## 重复

- 每天 08:00 · 日程 · 吃药
- 每周一三 19:00 · 日程 · 钢琴课
- 每月5日 · DDL · 交房租
- 每年11月4日 · 日程 · 妈妈生日
- 每月40日 · DDL · 不存在的日子
`
  const NOW = new Date('2026-11-02T17:00:00Z')
  const ZONE = 'Asia/Shanghai'

  it('parses the rules and skips what is out of range', () => {
    const entries = parseDdl(REPEATS)
    expect(entries.map(entry => entry.title)).toEqual(['吃药', '钢琴课', '交房租', '妈妈生日'])
    expect(entries[1]?.repeat).toEqual({ rule: { kind: 'weekly', weekdays: [1, 3] }, time: '19:00' })
    expect(entries[2]?.repeat).toEqual({ rule: { kind: 'monthly', day: 5 } })
  })

  it('falls on the right dates', () => {
    expect(repeatsOn({ kind: 'weekly', weekdays: [7] }, '2026-11-08')).toBe(true)
    expect(repeatsOn({ kind: 'weekly', weekdays: [7] }, '2026-11-09')).toBe(false)
    expect(repeatsOn({ kind: 'monthly', day: 31 }, '2026-11-30')).toBe(false)
    expect(repeatsOn({ kind: 'yearly', month: 3, day: 5 }, '2027-03-05')).toBe(true)
  })

  it('shows them in the week view on each day they fall, in order within the day', () => {
    const view = weekView(parseDdl(`${REPEATS}\n## 待完成\n\n- [ ] 2026-11-04T01:00Z · 日程 · 早会\n`), NOW, ZONE)
    // 11/03 is a Tuesday in Shanghai, the window's first day; 吃药 falls on all seven.
    expect(view.match(/吃药/gu)).toHaveLength(7)
    expect(view).toContain('📅 19:00 钢琴课（每周一三）')
    expect(view).toContain('📝 全天 交房租（每月5日）')
    expect(view).toContain('📅 全天 妈妈生日（每年11月4日）')
    const day = view.slice(view.indexOf('11/04'), view.indexOf('11/05'))
    expect(day.indexOf('妈妈生日')).toBeLessThan(day.indexOf('吃药'))
    expect(day.indexOf('吃药')).toBeLessThan(day.indexOf('早会'))
    expect(day.indexOf('早会')).toBeLessThan(day.indexOf('钢琴课'))
    expect(view).not.toContain('未定日期')
  })

  it('stays out of the daily brief when it repeats every day', () => {
    const entries = parseDdl(REPEATS)
    expect(todayItems(entries, NOW, ZONE)).toEqual([])
    expect(todayItems(entries, new Date('2026-11-03T17:00:00Z'), ZONE)).toEqual(['📅 全天 妈妈生日（每年11月4日）', '📅 19:00 钢琴课（每周一三）'])
  })

  it('describes entries on one line', () => {
    const [daily, weekly] = parseDdl(REPEATS)
    expect(describeEntry(daily as never, ZONE)).toBe('每天 08:00 · 日程 · 吃药')
    expect(describeEntry(weekly as never, ZONE)).toBe('每周一三 19:00 · 日程 · 钢琴课')
    const span = parseDdl('- [ ] 2026-11-04T16:00Z – 2026-11-06T15:59Z · 日程 · 回老家\n- [ ] 2026-11-05T01:00Z – 2026-11-05T02:00Z · 日程 · 开会\n- [ ] 无日期 · DDL · 买眼镜')
    expect(span.map(entry => describeEntry(entry, ZONE))).toEqual([
      '11/05 周四 全天 至 11/06 周五 · 日程 · 回老家',
      '11/05 周四 09:00–10:00 · 日程 · 开会',
      '未定日期 · DDL · 买眼镜',
    ])
  })
})
