/**
 * Specs for DeepSeek's peak hours: reading the setting, which instants fall in
 * them (Beijing time, Monday to Friday), the next off-peak moment, the coming
 * stretches, and the conversation's context in the user's own time.
 */

import { describe, expect, it } from 'vitest'
import { offPeakText } from '../src/host/off-peak.ts'
import { DEFAULT_PEAK_HOURS, formatPeakHours, offPeakFrom, parsePeakHours, peakSpanAt, upcomingPeaks } from '../src/shared/peak.ts'

/** An instant by its Beijing wall clock. */
const bj = (text: string): number => Date.parse(`${text}:00+08:00`)
const DEFAULT = parsePeakHours(DEFAULT_PEAK_HOURS) ?? []

describe('reading peak hours', () => {
  it('reads stretches in any order and with full-width commas or other dashes, and writes them back in order', () => {
    expect(DEFAULT).toEqual([{ start: 540, end: 720 }, { start: 840, end: 1080 }])
    expect(formatPeakHours(parsePeakHours('14:00–18:00，9:00~12:00') ?? [])).toBe(DEFAULT_PEAK_HOURS)
    expect(parsePeakHours('22:00-24:00')).toEqual([{ start: 1320, end: 1440 }])
    expect(parsePeakHours('  ')).toEqual([])
  })

  it('refuses what is not peak hours', () => {
    for (const text of ['9-12', '12:00-09:00', '09:00-09:00', '09:00-12:00-13:00', '25:00-26:00', '09:60-10:00', '24:30-24:45', 'soon']) {
      expect(parsePeakHours(text), text).toBeUndefined()
    }
  })
})

describe('which instants are peak', () => {
  it('follows Beijing time on weekdays, start included and end excluded', () => {
    expect(peakSpanAt(DEFAULT, bj('2026-11-16T08:59'))).toBeUndefined()
    expect(peakSpanAt(DEFAULT, bj('2026-11-16T09:00'))).toEqual({ start: bj('2026-11-16T09:00'), end: bj('2026-11-16T12:00') })
    expect(peakSpanAt(DEFAULT, bj('2026-11-16T12:00'))).toBeUndefined()
    expect(peakSpanAt(DEFAULT, bj('2026-11-20T17:59'))).toEqual({ start: bj('2026-11-20T14:00'), end: bj('2026-11-20T18:00') })
  })

  it('leaves weekends off peak all day, and a Monday morning in New York is Sunday night in Beijing', () => {
    expect(peakSpanAt(DEFAULT, bj('2026-11-21T10:00'))).toBeUndefined()
    expect(peakSpanAt(DEFAULT, bj('2026-11-22T15:00'))).toBeUndefined()
    // Sunday 2026-11-22 21:00 in New York is Monday 10:00 in Beijing.
    expect(peakSpanAt(DEFAULT, Date.parse('2026-11-22T21:00:00-05:00'))).toEqual({ start: bj('2026-11-23T09:00'), end: bj('2026-11-23T12:00') })
  })

  it('finds the first off-peak moment, past stretches that meet', () => {
    expect(offPeakFrom(DEFAULT, bj('2026-11-16T08:00'))).toBe(bj('2026-11-16T08:00'))
    expect(offPeakFrom(DEFAULT, bj('2026-11-16T10:00'))).toBe(bj('2026-11-16T12:00'))
    const meeting = parsePeakHours('09:00-12:00,12:00-18:00') ?? []
    expect(offPeakFrom(meeting, bj('2026-11-16T10:00'))).toBe(bj('2026-11-16T18:00'))
    const lateNight = parsePeakHours('00:00-02:00,22:00-24:00') ?? []
    expect(offPeakFrom(lateNight, bj('2026-11-16T23:00'))).toBe(bj('2026-11-17T02:00'))
    expect(offPeakFrom([], bj('2026-11-16T10:00'))).toBe(bj('2026-11-16T10:00'))
  })

  it('lists the coming stretches, the one under way first, skipping the weekend', () => {
    expect(upcomingPeaks(DEFAULT, bj('2026-11-20T15:00'), 3)).toEqual([
      { start: bj('2026-11-20T14:00'), end: bj('2026-11-20T18:00') },
      { start: bj('2026-11-23T09:00'), end: bj('2026-11-23T12:00') },
      { start: bj('2026-11-23T14:00'), end: bj('2026-11-23T18:00') },
    ])
    expect(upcomingPeaks([], bj('2026-11-20T15:00'), 3)).toEqual([])
  })
})

describe('the conversation\'s context', () => {
  it('gives the rule, whether it is peak now, and the coming stretches in the user\'s time', () => {
    const text = offPeakText(DEFAULT, bj('2026-11-16T10:00'), 'America/New_York')
    expect(text).toContain('# DeepSeek peak hours')
    expect(text).toContain('Monday to Friday, 09:00–12:00 and 14:00–18:00 Beijing time.')
    expect(text).toContain('- Now: peak hours, until 11/15 周日 23:00.')
    expect(text).toContain('- Coming peak hours in the user\'s time: 11/16 周一 01:00–05:00, 11/16 周一 20:00–23:00, 11/17 周二 01:00–05:00.')
    expect(text).toContain('Follow "Off-peak work" in your instructions.')
  })

  it('names the next stretch when it is off-peak', () => {
    const text = offPeakText(DEFAULT, bj('2026-11-21T10:00'), 'Asia/Shanghai')
    expect(text).toContain('- Now: off-peak; the next peak hours start 11/23 周一 09:00.')
  })
})
