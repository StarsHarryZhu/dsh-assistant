import { describe, expect, it } from 'vitest'
import { ZONE_KEY, calendarText, clientZone, localDays, processZone, validZone, weekLabel, zoneProjection } from '../src/host/calendar.ts'

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

  it('accepts only canonical zones from ordinary user messages', () => {
    expect(validZone('Asia/Shanghai')).toBe('Asia/Shanghai')
    expect(validZone('Mars/Olympus')).toBeUndefined()
    expect(typeof processZone()).toBe('string')
    expect(clientZone({ kind: 'user', clientTimeZone: 'Asia/Shanghai' })).toBe('Asia/Shanghai')
    expect(clientZone({ kind: 'time-context', clientTimeZone: 'Asia/Shanghai' })).toBeUndefined()
  })

  it('keeps the latest valid zone under its own key', () => {
    expect(ZONE_KEY).toBe('dshAssisstantTimeZone')
    let state = zoneProjection.init()
    state = zoneProjection.apply(state, { type: 'user/message', data: { source: { kind: 'user', clientTimeZone: 'America/New_York' } } })
    const same = zoneProjection.apply(state, { type: 'turn/start' })
    expect(same).toBe(state)
    expect(state).toEqual({ timeZone: 'America/New_York' })
    expect(() => zoneProjection.stateSchema.parse({})).toThrow()
  })
})
