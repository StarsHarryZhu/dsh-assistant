import { describe, expect, it } from 'vitest'
import { calendarText, clockText, localDays, processZone, validZone, weekLabel } from '../src/host/calendar.ts'

describe('the calendar', () => {
  it('crosses a month and a year with the right weekdays', () => {
    expect(weekLabel(new Date('2026-10-27T02:30:00Z'), 'America/New_York')).toBe('10/26 周一 – 11/01 周日')
    expect(weekLabel(new Date('2026-12-29T15:00:00Z'), 'America/New_York')).toBe('12/29 周二 – 01/04 周一')
  })

  it('is a different today in different zones', () => {
    const now = new Date('2026-10-27T02:30:00Z')
    expect(calendarText(now, 'America/New_York')).toMatch(/Today: 2026-10-26 周一\./u)
    expect(calendarText(now, 'Asia/Shanghai')).toMatch(/Today: 2026-10-27 周二\./u)
  })

  it('names the zone, lists 14 days, and marks the end of daylight saving time', () => {
    const text = calendarText(new Date('2026-10-27T02:30:00Z'), 'America/New_York')
    expect(text).toMatch(/America\/New_York \(UTC-04:00\)/u)
    expect(text).toMatch(/2026-11-01 周日 \(UTC-05:00 from this day\)/u)
    expect(localDays(new Date('2026-10-27T02:30:00Z'), 'America/New_York', 14)).toHaveLength(15)
    expect(calendarText(new Date('2026-10-27T02:30:00Z'), 'UTC')).toMatch(/UTC \(UTC\+00:00\)/u)
  })

  it('accepts only canonical zones', () => {
    expect(validZone('Asia/Shanghai')).toBe('Asia/Shanghai')
    expect(validZone('Mars/Olympus')).toBeUndefined()
    expect(validZone('上海')).toBeUndefined()
    expect(typeof processZone()).toBe('string')
  })

  it('reads the clock in the user\'s zone', () => {
    const now = new Date('2026-11-05T06:03:00Z')
    expect(clockText(now, 'Asia/Shanghai')).toBe('Current time: 2026-11-05 周四 14:03 (Asia/Shanghai, UTC+08:00).')
    expect(clockText(now, 'America/New_York')).toBe('Current time: 2026-11-05 周四 01:03 (America/New_York, UTC-05:00).')
  })
})
