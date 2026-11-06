import { describe, expect, it } from 'vitest'
import { dailySpan, inDailyQuiet, quietSpanAt, remindAt } from '../src/host/quiet.ts'

const ZONE = 'Asia/Shanghai'
const DAILY = { quietStart: '22:00', quietEnd: '08:00' }
/** An instant by its Shanghai wall clock. */
const at = (text: string): number => Date.parse(`${text}:00+08:00`)

describe('daily quiet hours', () => {
  it('find the window holding an instant, or the next one, across midnight', () => {
    expect(dailySpan(DAILY, at('2026-11-05T23:00'), ZONE)).toEqual({ start: at('2026-11-05T22:00'), end: at('2026-11-06T08:00') })
    expect(dailySpan(DAILY, at('2026-11-06T03:00'), ZONE)).toEqual({ start: at('2026-11-05T22:00'), end: at('2026-11-06T08:00') })
    expect(dailySpan(DAILY, at('2026-11-06T12:00'), ZONE)).toEqual({ start: at('2026-11-06T22:00'), end: at('2026-11-07T08:00') })
  })

  it('also work within one day', () => {
    expect(dailySpan({ quietStart: '13:00', quietEnd: '14:00' }, at('2026-11-05T13:30'), ZONE)).toEqual({ start: at('2026-11-05T13:00'), end: at('2026-11-05T14:00') })
  })

  it('are off when empty, malformed, or starting where they end', () => {
    for (const settings of [{ quietStart: '', quietEnd: '' }, { quietStart: '22:00', quietEnd: '' }, { quietStart: '25:00', quietEnd: '08:00' }, { quietStart: '08:00', quietEnd: '08:00' }]) {
      expect(dailySpan(settings, at('2026-11-05T23:00'), ZONE)).toBeUndefined()
      expect(quietSpanAt(settings, at('2026-11-05T23:00'), ZONE)).toBeUndefined()
    }
  })

  it('include their start and not their end', () => {
    expect(quietSpanAt(DAILY, at('2026-11-05T22:00'), ZONE)).toBeDefined()
    expect(quietSpanAt(DAILY, at('2026-11-05T08:00'), ZONE)).toBeUndefined()
    expect(quietSpanAt(DAILY, at('2026-11-05T21:59'), ZONE)).toBeUndefined()
  })

  it('follow the user\'s zone, not the computer\'s', () => {
    const inNewYork = quietSpanAt(DAILY, Date.parse('2026-11-05T23:00:00-05:00'), 'America/New_York')
    expect(inNewYork?.end).toBe(Date.parse('2026-11-06T08:00:00-05:00'))
    expect(quietSpanAt(DAILY, Date.parse('2026-11-05T12:00:00-05:00'), 'America/New_York')).toBeUndefined()
  })
})

describe('temporary quiet hours', () => {
  it('hold only during their stretch', () => {
    const settings = { quietStart: '', quietEnd: '', tempQuietFrom: at('2026-11-05T14:00'), tempQuietUntil: at('2026-11-05T16:00') }
    expect(quietSpanAt(settings, at('2026-11-05T13:00'), ZONE)).toBeUndefined()
    expect(quietSpanAt(settings, at('2026-11-05T15:00'), ZONE)).toEqual({ start: at('2026-11-05T14:00'), end: at('2026-11-05T16:00') })
    expect(quietSpanAt(settings, at('2026-11-05T16:00'), ZONE)).toBeUndefined()
  })

  it('join the daily hours they touch', () => {
    const settings = { ...DAILY, tempQuietFrom: at('2026-11-05T20:00'), tempQuietUntil: at('2026-11-06T10:00') }
    expect(quietSpanAt(settings, at('2026-11-05T21:00'), ZONE)).toEqual({ start: at('2026-11-05T20:00'), end: at('2026-11-06T10:00') })
    expect(quietSpanAt(settings, at('2026-11-06T02:00'), ZONE)).toEqual({ start: at('2026-11-05T20:00'), end: at('2026-11-06T10:00') })
  })
})

describe('a reminder', () => {
  const LEAD = 30

  it('comes its lead before the event outside quiet hours', () => {
    expect(remindAt(DAILY, at('2026-11-05T14:30'), LEAD, ZONE)).toBe(at('2026-11-05T14:00'))
    expect(remindAt(DAILY, at('2026-11-05T22:10'), LEAD, ZONE)).toBe(at('2026-11-05T21:40'))
  })

  it('that falls inside them moves to their end when the event is still ahead then', () => {
    expect(remindAt(DAILY, at('2026-11-06T08:15'), LEAD, ZONE)).toBe(at('2026-11-06T08:00'))
    expect(remindAt(DAILY, at('2026-11-06T08:00'), LEAD, ZONE)).toBe(at('2026-11-06T08:00'))
  })

  it('moves to just before them when the event itself is inside them', () => {
    expect(remindAt(DAILY, at('2026-11-05T23:30'), LEAD, ZONE)).toBe(at('2026-11-05T21:59'))
    expect(remindAt(DAILY, at('2026-11-06T06:00'), LEAD, ZONE)).toBe(at('2026-11-05T21:59'))
  })

  it('moves likewise around temporary hours', () => {
    const settings = { quietStart: '', quietEnd: '', tempQuietFrom: at('2026-11-05T14:00'), tempQuietUntil: at('2026-11-05T16:00') }
    expect(remindAt(settings, at('2026-11-05T16:10'), LEAD, ZONE)).toBe(at('2026-11-05T16:00'))
    expect(remindAt(settings, at('2026-11-05T15:00'), LEAD, ZONE)).toBe(at('2026-11-05T13:59'))
  })

  it('with no lead still moves out of them', () => {
    expect(remindAt(DAILY, at('2026-11-06T02:00'), 0, ZONE)).toBe(at('2026-11-05T21:59'))
  })
})

describe('a time of day in the daily quiet hours', () => {
  it('handles hours across midnight and within a day, and none', () => {
    const overnight = { quietStart: '22:00', quietEnd: '08:00' }
    expect(['22:00', '23:59', '00:00', '07:59'].map(time => inDailyQuiet(overnight, time))).toEqual([true, true, true, true])
    expect(['08:00', '12:00', '21:59'].map(time => inDailyQuiet(overnight, time))).toEqual([false, false, false])
    const midday = { quietStart: '13:00', quietEnd: '14:00' }
    expect(['12:59', '13:00', '13:59', '14:00'].map(time => inDailyQuiet(midday, time))).toEqual([false, true, true, false])
    expect(inDailyQuiet({ quietStart: '', quietEnd: '' }, '03:00')).toBe(false)
  })
})
